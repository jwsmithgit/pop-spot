import fetch from 'node-fetch';
import { redisClient } from '../utils/redis-client.js';
const API_BASE_URL = 'https://api.spotify.com/v1';

let delay = 1000;
async function fetchWithDelay(call, callData) {
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log('calling: ' + JSON.stringify(call));
    console.log('with data: ' + JSON.stringify(callData));
    const response = await fetch(call, callData);
    console.log('response status: ' + response.status);
    if (!response.ok) {
        if (response.status === 429 && response.headers.has('Retry-After')) {
            const retryAfter = response.headers.get('Retry-After');
            let delaySeconds;
            if (Number.isNaN(Number(retryAfter))) {
                delaySeconds = Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 1000);
            } else {
                delaySeconds = Number(retryAfter);
            }
            console.log(`Delaying for ${delaySeconds} seconds`);
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            return fetchWithDelay(call, callData);
        }

        throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    delay = Math.max(500, delay * 0.5);
    return await response.json();
}

async function getLikedTracks(accessToken) {
    const limit = 50;
    let offset = 0;
    let tracks = [];

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/tracks?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        for (let track of data.items.map(item => item.track)) {
            const trackData = {
                id: track.id,
                popularity: track.popularity,
                albumId: track.album.id
            };
            await redisClient.setTrackData(track.id, trackData);
            tracks.push(trackData);
        }

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
    }

    return tracks;
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

    const limit = 50;
    const albumChunks = [];
    for (let i = 0; i < queryAlbums.length; i += limit) {
        albumChunks.push(queryAlbums.slice(i, i + limit));
    }

    for (let i = 0; i < albumChunks.length; i++) {
        const data = await fetchWithDelay(`${API_BASE_URL}/albums?ids=${albumChunks[i].join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken,
            },
        });
        for (let album of data.albums) {
            const albumData = {
                id: album.id,
                trackIds: album.tracks.items.map(track => track.id)
            };
            await redisClient.setAlbumData(album.id, albumData);
            albums.push(albumData);
        }
    }

    return albums;
}

async function getLikedAlbums(accessToken) {
    const limit = 50;
    let offset = 0;
    let albums = [];

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/albums?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        for (let album of data.items.map(item => item.album)) {
            const albumData = {
                id: album.id,
                trackIds: album.tracks.items.map(track => track.id)
            };
            await redisClient.setAlbumData(album.id, albumData);
            albums.push(albumData);
        }

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
    }

    return albums;
}

async function getTracks(accessToken, trackIds) {
    const tracks = [];
    const queryTracks = [];

    for (let trackId of trackIds) {
        const trackData = await redisClient.getTrackData(trackId);
        console.log(trackData);
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
                'Authorization': 'Bearer ' + accessToken,
            },
        });
        for (let track of data.tracks) {
            const trackData = {
                id: track.id,
                popularity: track.popularity,
                albumId: track.album.id
            };
            await redisClient.setTrackData(track.id, trackData);
            tracks.push(trackData);
        }
    }

    return tracks;
}

function getPopularTracks(tracks) {
    const minPopularity = Math.min(...tracks.map(track => track.popularity));
    const maxPopularity = Math.max(...tracks.map(track => track.popularity));
    if (minPopularity == maxPopularity) return [];
    const popularity = minPopularity + (maxPopularity - minPopularity) * 0.9;
    return tracks.filter(track => track.popularity >= popularity);
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

function makeDistinct(array) {
    return [...new Set(array)];
}

function groupTracksByAlbumId(tracks) {
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
    let likedAlbums = await getLikedAlbums(accessToken);
    let likedTracks = await getLikedTracks(accessToken);
    let likedTrackAlbumIds = makeDistinct(likedTracks.map(track => track.albumId));
    let allAlbums = likedAlbums.concat(await getAlbums(accessToken, likedTrackAlbumIds));
    console.log('All albums: ' + JSON.stringify(allAlbums).substring(0, 100));

    let allTrackIds = makeDistinct(allAlbums.flatMap(album => album.trackIds));
    console.log('All tracks ids: ' + JSON.stringify(allTrackIds).substring(0, 100));
    let allTracks = getTracks(accessToken, allTrackIds);
    console.log('All tracks: ' + JSON.stringify(allTracks).substring(0, 100));
    let allTracksByAlbumId = groupTracksByAlbumId(allTracks);
    console.log('All albums: ' + JSON.stringify(allTracksByAlbumId).substring(0, 100));

    let popularTracksByAlbumId = {};
    for (let albumId in allTracksByAlbumId) {
        popularTracksByAlbumId[albumId] = getPopularTracks(allTracksByAlbumId[albumId]);
    }
    let popularTracks = Object.values(popularTracksByAlbumId).flat();
    console.log('Popular tracks: ' + JSON.stringify(popularTracks).substring(0, 100));

    await createPlaylist(accessToken, 'Pop Spot', 'Liked Album Popular Songs', popularTracks.map(track => track.uri));
}