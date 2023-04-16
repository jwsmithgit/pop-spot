import fetch from 'node-fetch';
import { redisClient } from '../utils/redis-client.js';
const API_BASE_URL = 'https://api.spotify.com/v1';

let delay = 100;
async function fetchWithDelay(call, callData) {
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log('calling: ' + JSON.stringify(call));
    console.log('calling data: ' + JSON.stringify(callData));

    const response = await fetch(call, callData);
    console.log('response status: ' + response.status);
    
    if (!response.ok) {
        if (response.status === 429 && response.headers.has('Retry-After')) {
            let delaySeconds = Number(response.headers.get('Retry-After'));
            console.log(`Delaying for ${delaySeconds} seconds`);
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            return fetchWithDelay(call, callData);
        }

        console.log('response status text: ' + response.statusText);
        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    delay = Math.max(100, delay * 0.5);
    return await response.json();
}

async function getLikedArtistIds(accessToken) {
    let artistIds = [];
    const limit = 50;
    let after = null;

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/following?type=artist&limit=${limit}` + (after ? `&after=${after}` : ``), { 
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        const ids = data.artists.items.map(artist => artist.id);
        artistIds.push(...ids);

        if (!data.next) break;
        after = artistIds[-1];
    }

    return artistIds;
}

async function getLikedAlbums(accessToken) {
    let albums = [];
    const limit = 50;
    let offset = 0;

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/albums?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        for (let album of data.items.map(item => item.album)) {
            const albumData = {
                id: album.id,
                artistIds: album.artists.map(artist => artist.id),
                trackIds: album.tracks.items.map(track => track.id)
            };
            await redisClient.setAlbumData(album.id, albumData);
            albums.push(albumData);
        }

        if (!data.next) break;
        offset += limit;
    }

    return albums;
}

async function getLikedTracks(accessToken) {
    let tracks = [];
    const limit = 50;
    let offset = 0;

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/tracks?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        for (let track of data.items.map(item => item.track)) {
            const trackData = {
                id: track.id,
                popularity: track.popularity,
                artistIds: track.artists.map(artist => artist.id),
                albumId: track.album.id,
                uri: track.uri
            };
            await redisClient.setTrackData(track.id, trackData);
            tracks.push(trackData);
        }

        if (!data.next) break;
        offset += limit;
    }

    return tracks;
}

async function getArtistAlbumIdsByArtistId(accessToken, artistIds) {
    let artistAlbumIds = {};
    const limit = 50;
    
    console.log('start' + artistIds.some(id => id.length > 22));

    const queryArtistIds = [];
    for (let artistId of artistIds) {
        const artistData = await redisClient.getArtistData(artistId);
        if (artistData) {
            artistAlbumIds[artistId] = artistData;
        } else {
            queryArtistIds.push(artistId);
        }
    }

    console.log('query' + queryArtistIds.some(id => id.length > 22));
    for (let artistId of queryArtistIds) {
        let albums = [];
        let offset = 0;
        while (true) {
            const data = await fetchWithDelay(`${API_BASE_URL}/artists/${artistId}/albums?include_groups=album&offset=${offset}&limit=${limit}`, {
                headers: {
                    'Authorization': 'Bearer ' + accessToken
                }
            });

            albums = albums.concat(data.items.map(item => item.id));

            if (!data.next) break;
            offset += limit;
        }

        await redisClient.setArtistData(artistId, albums);
        artistAlbumIds[artistId] = albums;

    }

    return artistAlbumIds;
}

async function getAlbums(accessToken, albumIds) {
    const albums = [];
    const queryAlbums = [];

    for (let albumId of albumIds) {
        const albumData = await redisClient.getAlbumData(albumId);
        if (albumData) {
            albums.push(albumData);
        } else {
            queryAlbums.push(albumId);
        }
    }

    const limit = 20;
    const albumChunks = [];
    for (let i = 0; i < queryAlbums.length; i += limit) {
        albumChunks.push(queryAlbums.slice(i, i + limit));
    }

    for (let i = 0; i < albumChunks.length; i++) {
        const data = await fetchWithDelay(`${API_BASE_URL}/albums?ids=${albumChunks[i].join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        for (let album of data.albums) {
            const albumData = {
                id: album.id,
                artistIds: album.artists.map(artist => artist.id),
                trackIds: album.tracks.items.map(track => track.id)
            };
            await redisClient.setAlbumData(album.id, albumData);
            albums.push(albumData);
        }
    }

    return albums;
}

async function getTracks(accessToken, trackIds) {
    const tracks = [];
    const queryTracks = [];

    for (let trackId of trackIds) {
        const trackData = await redisClient.getTrackData(trackId);
        if (trackData) {
            tracks.push(trackData);
        } else {
            queryTracks.push(trackId);
        }
    }

    const limit = 50;
    const trackChunks = [];
    for (let i = 0; i < queryTracks.length; i += limit) {
        trackChunks.push(queryTracks.slice(i, i + limit));
    }

    for (let chunk of trackChunks) {
        let data = await fetchWithDelay(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        for (let track of data.tracks) { 
            const trackData = {
                id: track.id,
                popularity: track.popularity,
                artistIds: track.artists.map(artist => artist.id),
                albumId: track.album.id,
                uri: track.uri
            };
            await redisClient.setTrackData(track.id, trackData);
            tracks.push(trackData);
        }
    }

    return tracks;
}

function getPopularTracks(tracks) {
    return getOutlierTracks(tracks);
    const minPopularity = Math.min(...tracks.map(track => track.popularity));
    const maxPopularity = Math.max(...tracks.map(track => track.popularity));
    if (minPopularity == maxPopularity) return [];
    const popularity = minPopularity + (maxPopularity - minPopularity) * 0.9;
    return tracks.filter(track => track.popularity >= popularity);
}

function getOutlierTracks(tracks) {
    // Step 1: Sort the data
    const sorted = tracks.sort((a, b) => a.popularity - b.popularity);

    // Step 2: Calculate Q1 and Q3
    const q1Index = Math.floor(sorted.length / 4);
    const q3Index = Math.floor(3 * sorted.length / 4);
    const q1 = sorted[q1Index].popularity;
    const q3 = sorted[q3Index].popularity;

    // Step 3: Calculate IQR
    const iqr = q3 - q1;

    // // Step 4: Calculate lower outlier boundary
    // const lowerBound = q1 - 1.5 * iqr;

    // Step 5: Calculate upper outlier boundary
    const upperBound = q3 + 1.5 * iqr;

    // Step 6: Identify outliers
    const outliers = [];
    for (const track of tracks) {
        // if (number < lowerBound || number > upperBound) {
        if (popularity > upperBound) {
            outliers.push(track);
        }
    }

    return outliers;
}

async function createPlaylist(accessToken, name, description, trackUris) {
    const data = await fetchWithDelay(`${API_BASE_URL}/me/playlists`, {
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

    const playlistId = data.id;

    // Divide the track URIs into chunks of 100
    const chunkedTrackUris = [];
    for (let i = 0; i < trackUris.length; i += 100) {
        chunkedTrackUris.push(trackUris.slice(i, i + 100));
    }

    // Send requests for each chunk of track URIs
    for (let i = 0; i < chunkedTrackUris.length; i++) {
        await fetchWithDelay(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: chunkedTrackUris[i]
            })
        });

        console.log('Tracks added to playlist!');
    }
}

function groupTracksByAlbumId(tracks) {
    return tracks.reduce((result, track) => {
        const albumId = track.albumId;
        if (!result[albumId]) {
            result[albumId] = [];
        }
        result[albumId].push(track);
        return result;
    }, {});
}

export async function execute(accessToken) {
    let likedArtistIds = await getLikedArtistIds(accessToken);
    console.log('artists' + likedArtistIds.some(id => id.length > 22));
    let likedAlbums = await getLikedAlbums(accessToken);
    let likedTracks = await getLikedTracks(accessToken);

    // if a track has one artist, add it to liked artists
    likedArtistIds = likedArtistIds.concat(likedTracks.filter(track => track.artistIds.length == 1).map(track => track.artistIds));
    console.log('tracks' + likedArtistIds.some(id => id.length > 22));
    // otherwise add to liked albums to find album artist
    likedAlbums = likedAlbums.concat(await getAlbums(accessToken, likedTracks.filter(track => track.artistIds.length > 1).map(track => track.albumId)));
    likedAlbums = Array.from(new Set(likedAlbums.map(album => album.id))).map(id => likedAlbums.find(album => album.id == id));
    likedArtistIds = likedArtistIds.concat(likedAlbums.map(album => album.artistIds));
    console.log('albums' + likedArtistIds.some(id => id.length > 22));
    likedArtistIds = [...new Set(likedArtistIds)];
    console.log('last' + likedArtistIds.some(id => id.length > 22));

    let artistAlbumIdsByArtistId = await getArtistAlbumIdsByArtistId(accessToken, likedArtistIds);
    let artistAlbums = await getAlbums(accessToken, Object.values(artistAlbumIdsByArtistId).flat());
    let artistAlbumTracks = await getTracks(accessToken, artistAlbums.flatMap(album => album.trackIds));
    let artistAlbumTracksByAlbumId = groupTracksByAlbumId(artistAlbumTracks);

    let popularTracksByAlbumId = {};
    for (let albumId in artistAlbumTracksByAlbumId) {
        popularTracksByAlbumId[albumId] = getPopularTracks(artistAlbumTracksByAlbumId[albumId]);
    }
    let popularTracks = Object.values(popularTracksByAlbumId).flat();
    console.log('Popular tracks: ' + JSON.stringify(popularTracks).substring(0, 100));

    await createPlaylist(accessToken, 'Pop Spot', 'Liked Album Popular Songs', popularTracks.map(track => track.uri));
}