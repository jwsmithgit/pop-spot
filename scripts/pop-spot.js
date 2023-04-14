import fetch from 'node-fetch';
const API_BASE_URL = 'https://api.spotify.com/v1';

const delay = 1000;
async function fetchWithDelay(call, data) {
    const response = await fetch(call, data);

    if (!response.ok) {
      console.log(JSON.stringify(response));
      if (response.status === 429) {
        delay = Math.min(delay * 2, 60000); // Set a maximum delay of 1 minute
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithDelay(call, data);
      }
      throw new Error(`Failed to get liked songs: ${data.error}`);
    }

    delay = Math.max(1000, delay * 0.5);
    return response;
}

async function getLikedTracks(accessToken) {
    const limit = 50;
    let offset = 0;
    let allTracks = [];

    while (true) {
        const response = await fetchWithDelay(`${API_BASE_URL}/me/tracks?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await response.json()
        allTracks = allTracks.concat(data.items);

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
    }

    return allTracks;
}

async function getAlbumsByIds(accessToken, albumIds) {
    const limit = 50;
    const albumChunks = [];
    for (let i = 0; i < albumIds.length; i += limit) {
        albumChunks.push(albumIds.slice(i, i + limit));
    }

    const albums = [];
    for (let i = 0; i < albumChunks.length; i++) {
        const response = await fetchWithDelay(`${API_BASE_URL}/albums?ids=${albumChunks[i].join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        const data = await response.json();
        albums.push(...data.albums);
    }

    return albums;
}

async function getLikedAlbums(accessToken) {
    const limit = 50;
    let offset = 0;
    let allAlbums = [];

    while (true) {
        const response = await fetchWithDelay(`${API_BASE_URL}/me/albums?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        const data = await response.json();
        allAlbums = allAlbums.concat(data.items);

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
    }

    return allAlbums;
}

async function getTracks(accessToken, trackIds) {
    let i, j, chunk, response;
    const trackData = {};

    for (i = 0, j = trackIds.length; i < j; i += 100) {
        chunk = trackIds.slice(i, i + 100);
        response = await fetchWithDelay(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await response.json();
        data.tracks.forEach((track) => {
            trackData[track.id] = track;
        });
    }

    return trackData;
}

function getPopularTracks(tracks) {
    const minPopularity = Math.min(...tracks.map(track => track.popularity));
    const maxPopularity = Math.max(...tracks.map(track => track.popularity));
    if (minPopularity == maxPopularity) return [];
    const popularity = minPopularity + (maxPopularity - minPopularity) * 0.9;
    return tracks.filter(track => track.popularity >= popularity);
}

async function createPlaylist(accessToken, name, description, trackUris) {
    const response = await fetchWithDelay(`${API_BASE_URL}/me/playlists`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name,
            description
        })
    });

    const data = await response.json();
    const playlistId = data.id;

    // Divide the track URIs into chunks of 100
    const chunkedTrackUris = [];
    for (let i = 0; i < trackUris.length; i += 100) {
        chunkedTrackUris.push(trackUris.slice(i, i + 100));
    }

    // Send requests for each chunk of track URIs
    for (let i = 0; i < chunkedTrackUris.length; i++) {
        const addTracksResponse = await fetchWithDelay(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: chunkedTrackUris[i]
            })
        });

        const addTracksData = await addTracksResponse.json();
        if (!addTracksResponse.ok) {
            console.log(JSON.stringify(addTracksData));
            throw new Error(`Failed to add tracks to playlist: ${addTracksData.error}`);
        }
        else {
            console.log('Tracks added to playlist!');
        }
    }
}

function makeDistinct(array) {
    return [...new Set(array)];
}

function groupTracksByAlbum(tracks) {
    return tracks.reduce((result, track) => {
        const albumId = track.album.id;
        if (!result[albumId]) {
            result[albumId] = [];
        }
        result[albumId].push(track);
        return result;
    }, {});
}

export async function execute(accessToken) {
    // let likedAlbums = await getLikedAlbums(accessToken);
    // console.log(JSON.stringify(likedAlbums));
    let likedTracks = await getLikedTracks(accessToken);
    console.log(JSON.stringify(likedTracks));
    let likedTrackAlbumIds = makeDistinct(likedTracks.map(track => track.track.album.id));
    // console.log('All albums: ' + JSON.stringify(likedTrackAlbumIds));
    let allAlbums = await getAlbumsByIds(accessToken, likedTrackAlbumIds);//likedAlbums.concat(await getAlbumsByIds(likedTrackAlbumIds));
    // console.log('All albums: ' + JSON.stringify(allAlbums));

    let allAlbumTrackIds = makeDistinct(allAlbums.flatMap(album => album.album.trackIds));
    console.log('All albums: ' + JSON.stringify(allAlbumTrackIds));
    let allAlbumTracks = getTracks(accessToken, allAlbumTrackIds);
    console.log('All albums: ' + JSON.stringify(allAlbumTracks));
    let allAlbumTracksByAlbumId = groupTracksByAlbum(allAlbumTracks);
    console.log('All albums: ' + JSON.stringify(allAlbumTracksByAlbumId));

    let popularTracksByAlbumId = {};
    for (let albumId in allAlbumTracksByAlbumId) {
        popularTracksByAlbumId[albumId] = getPopularTracks(allAlbumTracksByAlbumId[albumId]);
    }
    let popularTracks = Object.values(popularTracksByAlbumId).flat();
    console.log('Popular tracks: ' + JSON.stringify(popularTracks));

    await createPlaylist(accessToken, 'Pop Spot', 'Liked Album Popular Songs', popularTracks.map(track => track.uri));
}