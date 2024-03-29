import fetch from 'node-fetch';
import { redisClient } from '../utils/redis-client.js';
import * as utils from '../utils/utils.js';
const API_BASE_URL = 'https://api.spotify.com/v1';

let delay = 100;
async function fetchWithDelay(call, callData) {
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log('calling: ' + JSON.stringify(call));
    // console.log('calling data: ' + JSON.stringify(callData));

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

// async function addArtists(artists) {
//     let addedArtists = {};
//     const skipGenres = ['asmr'];
//     for (let artist of artists) {
//         let artistData = {
//             id: artist.id,
//             name: artist.name,
//             // popularity: artist.popularity
//         };
//         if (artist.genres.some(genre => skipGenres.includes(genre))) artistData = 'x';
//         await redisClient.setArtistData(artist.id, artistData);
//         if (artistData == 'x') continue;
//         addedArtists[artist.id] = artistData;
//     }
//     return addedArtists;
// }

// async function addAlbums(albums) {
//     let addedAlbums = {};
//     const skipAlbumTypes = ['compilation', 'appears_on', 'live', 'remix', 'audiobook'];
//     for (let album of albums) {
//         let albumData = {
//             id: album.id,
//             artistIds: album.artists.map(artist => artist.id),
//             trackIds: album.tracks.items.map(track => track.id),
//             popularity: album.popularity,
//             releaseDate: album.release_date
//         };
//         if (skipAlbumTypes.includes(album.album_type)) albumData = 'x';
//         if (album.artists.length > 1) albumData = 'x';
//         await redisClient.setAlbumData(album.id, albumData);
//         if (albumData == 'x') continue;
//         addedAlbums[album.id] = albumData;
//     }
//     return addedAlbums;
// }

// async function addTracks(tracks) {
//     let addedTracks = {};
//     for (let track of tracks) {
//         let trackData = {
//             id: track.id,
//             artistIds: track.artists.map(artist => artist.id),
//             albumId: track.album.id,
//             popularity: track.popularity,
//             trackNumber: track.track_number,
//             name: track.name
//         };
//         if (track.linked_from) trackData = 'x';
//         await redisClient.setTrackData(track.id, trackData);
//         if (trackData == 'x') continue;
//         addedTracks[track.id] = trackData;
//     }
//     return addedTracks;
// }

async function getLikedArtists(accessToken) {
    let artists = {};
    const limit = 50;
    let after = null;

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/following?type=artist&limit=${limit}` + (after ? `&after=${after}` : ``), {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        data.artists.items.forEach(artist => artists[artist.id] = artist);
        // artists = { ...artists, ...await addArtists(data.artists.items) };

        if (!data.next) break;
        after = data.artists.items.map(artist => artist.id)[-1];
    }

    return artists;
}

async function getLikedAlbums(accessToken) {
    let albums = {};
    const limit = 50;
    let offset = 0;

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/albums?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        data.items.map(item => item.album).forEach(album => albums[album.id] = album);
        // albums = { ...albums, ...await addAlbums(data.items.map(item => item.album)) };

        if (!data.next) break;
        offset += limit;
    }

    return albums;
}

async function getLikedTracks(accessToken) {
    let tracks = {};
    const limit = 50;
    let offset = 0;

    while (true) {
        const data = await fetchWithDelay(`${API_BASE_URL}/me/tracks?offset=${offset}&limit=${limit}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        data.items.map(item => item.track).forEach(track => tracks[track.id] = track);
        // tracks = { ...tracks, ...await addTracks(data.items.map(item => item.track)) };

        if (!data.next) break;
        offset += limit;
    }

    return tracks;
}

async function getArtists(accessToken, artistIds) {
    let artists = {};

    // let queryArtistIds = [];
    // for (let artistId of artistIds) {
    //     const artistData = await redisClient.getArtistData(artistId);
    //     if (artistData == 'x') continue;
    //     if (artistData) artists[artistId] = artistData;
    //     else queryArtistIds.push(artistId);
    // }

    for (let artistChunk of utils.chunkArray(artistIds, 50)) {
        const data = await fetchWithDelay(`${API_BASE_URL}/artists?ids=${artistChunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        data.artists.forEach(artist => artists[artist.id] = artist);
        // artists = { ...artists, ...await addArtists(data.artists) };
    }

    return artists;
}

async function getArtistAlbums(accessToken, artistIds) {
    let artistAlbums = {};

    // let queryArtistIds = [];
    // for (let artistId of artistIds) {
    //     const artistAlbumData = await redisClient.getArtistAlbumData(artistId);
    //     if (artistAlbumData == 'x') continue;
    //     if (artistAlbumData) artistAlbums[artistId] = artistAlbumData;
    //     else queryArtistIds.push(artistId);
    // }

    const limit = 50;
    for (let artistId of artistIds) {
        let albums = [];
        let offset = 0;
        while (true) {
            const data = await fetchWithDelay(`${API_BASE_URL}/artists/${artistId}/albums?include_groups=album,single&offset=${offset}&limit=${limit}`, {
                headers: {
                    'Authorization': 'Bearer ' + accessToken
                }
            });

            // data.items.map(item => item.id).foreach(albumId => albums[albumId] = {});
            albums = albums.concat(data.items.map(item => item.id));

            if (!data.next) break;
            offset += limit;
        }

        // await redisClient.setArtistAlbumData(artistId, albums);
        artistAlbums[artistId] = albums;
    }

    return artistAlbums;
}

async function getAlbums(accessToken, albumIds) {
    let albums = {};

    // let queryAlbums = [];
    // for (let albumId of albumIds) {
    //     const albumData = await redisClient.getAlbumData(albumId);
    //     if (albumData == 'x') continue;
    //     if (albumData) albums[albumId] = albumData;
    //     else queryAlbums.push(albumId);
    // }

    for (let albumChunk of utils.chunkArray(albumIds, 20)) {
        const data = await fetchWithDelay(`${API_BASE_URL}/albums?ids=${albumChunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        data.albums.forEach(album => albums[album.id] = album);
        // albums = { ...albums, ...await addAlbums(data.albums) };
    }

    return albums;
}

async function getTracks(accessToken, trackIds) {
    let tracks = {};

    // let queryTracks = [];
    // for (let trackId of trackIds) {
    //     const trackData = await redisClient.getTrackData(trackId);
    //     if (trackData == 'x') continue;
    //     if (trackData) tracks[trackId] = trackData;
    //     else queryTracks.push(trackId);
    // }

    for (let trackChunk of utils.chunkArray(trackIds, 50)) {
        let data = await fetchWithDelay(`https://api.spotify.com/v1/tracks?ids=${trackChunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        data.tracks.forEach(track => tracks[track.id] = track);
        // tracks = { ...tracks, ...await addTracks(data.tracks) };
    }

    return tracks;
}

function getPopTracks(tracks, albums, artists) {
    let popTracks = [];

    const albumTrackPopularityScores = Object.values(albums).reduce((acc, album) => {
        const albumTrackPopularityScores = album.trackIds
            .map((trackId) => tracks[trackId].popularity);

        const albumTrackPopularityMean = albumTrackPopularityScores.reduce((acc, score) => acc + score, 0) / albumTrackPopularityScores.length;
        const albumTrackPopularityDeviation = Math.sqrt(albumTrackPopularityScores.reduce((acc, score) => acc + Math.pow(score - albumTrackPopularityMean, 2), 0) / albumTrackPopularityScores.length);

        const filteredAlbumTrackPopularityScores = albumTrackPopularityScores.filter((score) => score >= albumTrackPopularityMean - 0.5 * albumTrackPopularityDeviation);

        const filteredAlbumTrackPopularityMean = filteredAlbumTrackPopularityScores.reduce((acc, score) => acc + score, 0) / filteredAlbumTrackPopularityScores.length;
        const filteredAlbumTrackPopularityDeviation = Math.sqrt(filteredAlbumTrackPopularityScores.reduce((acc, score) => acc + Math.pow(score - filteredAlbumTrackPopularityMean, 2), 0) / filteredAlbumTrackPopularityScores.length);

        acc[album.id] = { mean: filteredAlbumTrackPopularityMean, deviation: filteredAlbumTrackPopularityDeviation };
        return acc;
    }, {});

    const artistAlbumPopularityScores = Object.values(artists).reduce((acc, artist) => {
        const artistAlbumPopularityScores = artist.albumIds
            .map((albumId) => albums[albumId].popularity);

        const artistAlbumPopularityMean = artistAlbumPopularityScores.reduce((acc, score) => acc + score, 0) / artistAlbumPopularityScores.length;
        const artistAlbumPopularityDeviation = Math.sqrt(artistAlbumPopularityScores.reduce((acc, score) => acc + Math.pow(score - artistAlbumPopularityMean, 2), 0) / artistAlbumPopularityScores.length);

        const filteredArtistAlbumPopularityScores = artistAlbumPopularityScores.filter((score) => score >= artistAlbumPopularityMean - 0.5 * artistAlbumPopularityDeviation);

        const filteredArtistAlbumPopularityMean = filteredArtistAlbumPopularityScores.reduce((acc, score) => acc + score, 0) / filteredArtistAlbumPopularityScores.length;
        const filteredArtistAlbumPopularityDeviation = Math.sqrt(filteredArtistAlbumPopularityScores.reduce((acc, score) => acc + Math.pow(score - filteredArtistAlbumPopularityMean, 2), 0) / filteredArtistAlbumPopularityScores.length);

        acc[artist.id] = { mean: filteredArtistAlbumPopularityMean, deviation: filteredArtistAlbumPopularityDeviation };
        return acc;
    }, {});

    // Loop over each album
    for (let artist of Object.values(artists)) {
        const artistAlbumPopularity = artistAlbumPopularityScores[artist.id];

        const artistAlbums = artists[artist.id].albumIds.map(albumId => albums[albumId]);
        for (let album of artistAlbums) {
            const albumTrackPopularity = albumTrackPopularityScores[album.id];
            if (albumTrackPopularity.deviation == 0) continue;

            const albumThreshold = artistAlbumPopularity.mean + artistAlbumPopularity.deviation;
            const albumDeviation = Math.max(0, albumThreshold - album.popularity);

            const albumTracks = album.trackIds.map(trackId => tracks[trackId]).filter(track => track.popularity >= albumTrackPopularity.mean + 0.5 * albumTrackPopularity.deviation + 0.5 * albumDeviation);
            popTracks = popTracks.concat(albumTracks);
        }
    }

    return popTracks;
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

    // Send requests for each chunk of track URIs
    for (let trackChunk of utils.chunkArray(trackUris, 100)) {
        await fetchWithDelay(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: trackChunk
            })
        });

        console.log('Tracks added to playlist!');
    }
}

export async function execute(accessToken) {
    let artistPopTracks = {};
    let artistNames = {};

    let likedTracks = await getLikedTracks(accessToken);
    let tracks = {};
    for (let track of Object.values(likedTracks)) {
        track.artists.forEach(artist => artistNames[artist.id] = artist.name);
        let key = track.artists.map(artist => artist.id).join(',');
        if (artistPopTracks[key]) continue;
        let savedTracks = await redisClient.getData(key);
        if (savedTracks) artistPopTracks[key] = savedTracks;
        else tracks[track.id] = track;
    }

    let likedAlbums = await getLikedAlbums(accessToken);
    likedAlbums = { ...likedAlbums, ...await getAlbums(accessToken, Object.values(tracks).map(track => track.album.id)) };
    let albums = {};
    for (let album of Object.values(likedAlbums)) {
        album.artists.forEach(artist => artistNames[artist.id] = artist.name);
        let key = album.artists.map(artist => artist.id).join(',');
        if (artistPopTracks[key]) continue;
        let savedTracks = await redisClient.getData(key);
        if (savedTracks) artistPopTracks[key] = savedTracks;
        else albums[album.id] = album;
    }

    let likedArtists = await getLikedArtists(accessToken);
    likedArtists = { ...likedArtists, ...await getArtists(accessToken, Object.values(albums).flatMap(album => album.artists.map(artist => artist.id))) };
    let artists = {};
    for (let artist of Object.values(likedArtists)) {
        artistNames[artist.id] = artist.name;
        let key = String(artist.id)
        if (artistPopTracks[key]) continue;
        let savedTracks = await redisClient.getData(key);
        if (savedTracks) artistPopTracks[key] = savedTracks;
        else artists[artist.id] = artist;
    }

    let artistAlbums = await getArtistAlbums(accessToken, Object.values(artists).map(artist => artist.id));
    for (let artistId in artistAlbums) artists[artistId].albumIds = artistAlbums[artistId];

    albums = await getAlbums(accessToken, Object.values(artists).map(artist => artist.albums.map(album => album.id).flat()));
    for (let artistId in artists) artists[artistId].albumIds = artists[artistId].albumIds.filter(albumId => albums[albumId]);

    tracks = await getTracks(accessToken, Object.values(albums).flatMap(album => album.tracks.items.map(track => track.id)));
    let popTracks = getPopTracks(tracks, albums, artists);

    // remove duplicates
    let popTracksByName = {};
    popTracks.forEach(track => {
        const key = JSON.stringify(track.artistIds) + track.name;
        if (!popTracksByName[key] || track.popularity > popTracksByName[key].popularity) popTracksByName[key] = track;
    });
    popTracks = Object.values(popTracksByName);

    popTracks = popTracks.sort((a, b) => {
        if (a.artistIds[0] != b.artistIds[0]) {
            // i guess this can happen if the main artist is not the album artist???
            let aArtist = artists[a.artistIds.find(artistId => artists[artistId])];
            let bArtist = artists[b.artistIds.find(artistId => artists[artistId])];
            if (!aArtist) return 1;
            if (!bArtist) return -1;
            return aArtist.name.toLowerCase() < bArtist.name.toLowerCase() ? -1 : 1;
        }
        if (a.albumId != b.albumId) return albums[a.albumId].releaseDate < albums[b.albumId].releaseDate ? -1 : 1;
        return a.trackNumber - b.trackNumber;
    });

    let addArtistPopTracks = {};
    popTracks.forEach(track => {
        const key = track.artists.map(artist => artist.id).join(',');
        if (!addArtistPopTracks[key]) addArtistPopTracks[key] = [];
        addArtistPopTracks[key].push(track);
    });
    
    for (let key in addArtistPopTracks) {
        redisClient.setData(key, addArtistPopTracks[artistId]);
        artistPopTracks[artistId] = addArtistPopTracks[aristId];
    }

    sortedArtistNames = Object.values(artistNames).sort();
    popTracks = [];
    for (let artistId in Object.key(artistPopTracks).sort((a, b) => artistNames[a].toLowerCase() < artistNames[b].toLowerCase() ? -1 : 1)) {
        popTracks = popTracks.concat(artistPopTracks[artistId]);
    }
    
    // console.log('Popular tracks: ' + JSON.stringify(popularTracks).substring(0, 100));
    await createPlaylist(accessToken, 'Pop Spot', 'Liked Artist Popular Tracks', popTracks.map(track => `spotify:track:${track.id}`));
}