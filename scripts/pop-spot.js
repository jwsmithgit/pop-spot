import fetch from 'node-fetch';
const API_BASE_URL = 'https://api.spotify.com/v1';

async function getLikedTracks(accessToken) {
    const limit = 50;
    let offset = 0;
    let allTracks = [];

    while (true) {
        const response = await fetch(`${API_BASE_URL}/me/tracks?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            console.log(JSON.stringify(data));
            throw new Error(`Failed to get liked songs: ${data.error}`);
        }

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
        const response = await fetch(`${API_BASE_URL}/albums?ids=${albumChunks[i].join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        const data = await response.json();
        if (!response.ok) {
            console.log(JSON.stringify(data));
            throw new Error(`Failed to get albums: ${data.error}`);
        }
        albums.push(...data.albums);
    }

    return albums;
}

async function getLikedAlbums(accessToken) {
    const limit = 50;
    let offset = 0;
    let allAlbums = [];

    while (true) {
        const response = await fetch(`${API_BASE_URL}/me/albums?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        const data = await response.json();
        if (!response.ok) {
            console.log(JSON.stringify(data));
            throw new Error(`Failed to get liked albums: ${data.error}`);
        }

        allAlbums = allAlbums.concat(data.items);

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
    }

    return allAlbums;
}

function getPopularTracks(tracks) {
    const minPopularity = Math.min(...tracks.map(track => track.popularity));
    const maxPopularity = Math.max(...tracks.map(track => track.popularity));
    if (minPopularity == maxPopularity) return [];
    const popularity = minPopularity + (maxPopularity - minPopularity) * 0.9;
    return tracks.filter(track => track.popularity >= popularity);
}

async function createPlaylist(accessToken, name, description, trackUris) {
    const response = await fetch(`${API_BASE_URL}/me/playlists`, {
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
    if (!response.ok) {
        console.log(JSON.stringify(data));
        throw new Error(`Failed to create playlist: ${data.error}`);
    }

    const playlistId = data.id;

    // Divide the track URIs into chunks of 100
    const chunkedTrackUris = [];
    for (let i = 0; i < trackUris.length; i += 100) {
        chunkedTrackUris.push(trackUris.slice(i, i + 100));
    }

    // Send requests for each chunk of track URIs
    for (let i = 0; i < chunkedTrackUris.length; i++) {
        const addTracksResponse = await fetch(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
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
    let allAlbums = await getAlbumsByIds(likedTrackAlbumIds);//likedAlbums.concat(await getAlbumsByIds(likedTrackAlbumIds));
    // console.log('All albums: ' + JSON.stringify(allAlbums));

    let allAlbumTrackIds = makeDistinct(allAlbums.flatMap(album => album.album.trackIds));
    console.log('All albums: ' + JSON.stringify(allAlbumTrackIds));
    let allAlbumTracks = getTracks(allAlbumTrackIds);
    console.log('All albums: ' + JSON.stringify(allAlbumTracks));
    let allAlbumTracksByAlbumId = groupTracksByAlbum(allAlbumTracks);
    console.log('All albums: ' + JSON.stringify(allAlbumTracksByAlbumId));

    let popularTracksByAlbumId = {};
    for (let albumId in allAlbumTracksByAlbumId)
    {
        popularTracksByAlbumId[albumId] = getPopularTracks(allAlbumTracksByAlbumId[albumId]);
    }
    let popularTracks = Object.values(popularTracksByAlbumId).flat();
    console.log('Popular tracks: ' + JSON.stringify(popularTracks));
    
    await createPlaylist(accessToken, 'Pop Spot', 'Liked Album Popular Songs', popularTracks.map(track => track.uri));
}