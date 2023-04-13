import fetch from 'node-fetch';
import base64 from 'base-64';

// Replace these values with your own Client ID and Client Secret
const CLIENT_ID = 'a02434801a964928b903cf894c58151e';
const CLIENT_SECRET = '6ee1a0e15d7b45c09e0306a4cbba8a5b';
const REDIRECT_URI = 'https://warm-wave-05889.herokuapp.com/callback';

// This is the URL for the Spotify Web API endpoint to get an access token
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

// This is the base URL for the Spotify Web API endpoints
const API_BASE_URL = 'https://api.spotify.com/v1';

// This function will get an access token using your Client ID and Client Secret
async function getAccessToken() {
    // Use the `fetch()` function to send a POST request to the token endpoint with your Client ID and Client Secret
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${base64.encode(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
        },
        body: `grant_type=client_credentials&redirect_uri=${REDIRECT_URI}`
    });

    // Parse the response as JSON and extract the access token from the response
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to get access token: ${data.error}`);
    }

    return data.access_token;
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

        console.log('Response:', response);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(`Failed to get liked albums: ${data.error}`);
        }

        allAlbums = allAlbums.concat(data.items);

        if (data.next) {
            offset += limit;
        } else {
            break;
        }
        break;
    }

    return allAlbums;
}

async function getAlbumTracks(accessToken, albumId) {
    const response = await fetch(`${API_BASE_URL}/albums/${albumId}/tracks`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to get album tracks: ${data.error}`);
    }

    return data.items;
}

function findPopularTracks(tracks) {
    const maxPopularity = Math.max(...tracks.map(track => track.popularity));
    const halfMaxPopularity = maxPopularity / 2;

    return tracks.filter(track => track.popularity >= halfMaxPopularity);
}

async function createPlaylist(accessToken, name, description, trackUris) {
    const response = await fetch(`${API_BASE_URL}/users/me/playlists`, {
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
        throw new Error(`Failed to create playlist: ${data.error}`);
    }

    const playlistId = data.id;

    await fetch(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            uris: trackUris
        })
    });

    console.log('Tracks added to playlist!');
}

(async function() {
    let token = await getAccessToken();
    let albums = await getLikedAlbums(token);
    let trackIds = albums.flatMap(album => album.album.tracks.items.map(track => track.uri));
    let tracks = await getAlbumTracks(token, trackIds);
    let popularTracks = findPopularTracks(tracks);
    await createPlaylist(token, 'Pop Spot', 'Liked Album Popular Songs', popularTracks);
})();