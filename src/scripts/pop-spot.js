import fetch from 'node-fetch';
import { saveAlbumData, getAlbumData, saveTrackData, getTrackData } from '../utils/redis-client.js';
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

    delay = Math.max(1000, delay * 0.5);
    return await response.json();
}

async function getLikedTracks(accessToken) {
    const limit = 50;
    let offset = 0;
    let allTracks = [];

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/tracks?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        allTracks = allTracks.concat(data.items);

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
    }

    return allTracks;
}

async function getAlbums(accessToken, albumIds) {
    const albums = [];
    const queryAlbums = [];

    for (let albumId of albumIds) {
        const albumData = getAlbumData(albumId);
        if (albumData) {
            albums.push(JSON.parse(albumData));
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
            saveAlbumData(album.id, JSON.stringify(album));
            albums.push(album);
        }
    }

    return albums;
}

async function getLikedAlbums(accessToken) {
    const limit = 50;
    let offset = 0;
    let allAlbums = [];

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/albums?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

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
    const tracks = [];
    const queryTracks = [];

    for (let trackId of trackIds) {
        const trackData = getTrackData(trackId);
        if (trackData) {
            tracks.push(JSON.parse(trackData));
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
            saveTrackData(track.id, JSON.stringify(track));
            tracks.push(track);
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
    let likedTrackAlbumIds = makeDistinct(likedTracks.map(track => track.track.album.id));
    let allAlbums = likedAlbums.concat(await getAlbums(likedTrackAlbumIds));

    let allTrackIds = makeDistinct(allAlbums.flatMap(album => album.trackIds));
    let allTracks = getTracks(accessToken, allTrackIds);
    let allTracksByAlbumId = groupTracksByAlbumId(allTracks);
    console.log('All albums: ' + JSON.stringify(allTracksByAlbumId));

    let popularTracksByAlbumId = {};
    for (let albumId in allTracksByAlbumId) {
        popularTracksByAlbumId[albumId] = getPopularTracks(allTracksByAlbumId[albumId]);
    }
    let popularTracks = Object.values(popularTracksByAlbumId).flat();
    console.log('Popular tracks: ' + JSON.stringify(popularTracks));

    await createPlaylist(accessToken, 'Pop Spot', 'Liked Album Popular Songs', popularTracks.map(track => track.uri));
}