import fetch from 'node-fetch';
import { redisClient } from '../utils/redis-client.js';
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

async function addArtists(artists) {
    let addedArtists = {};
    const skipGenres = ['asmr'];
    for (let artist of artists) {
        if (artist.genres.some(genre => skipGenres.includes(genre))) continue;

        const artistData = {
            id: artist.id,
            name: artist.name
        };
        await redisClient.setArtistData(artist.id, artistData);
        addedArtists[artist.id] = artistData;
    }
    return addedArtists;
}

// async function addArtistAlbums(artistAlbums) {
//     let addedArtistAlbums = {};
//     for (let artistId in artistAlbums) {
//         await redisClient.setArtistAlbumData(artistId, artistAlbums[artistId]);
//         addedArtistAlbums[artistId] = artistAlbums[artistId];
//     }
//     return addedArtistAlbums;
// }

async function addAlbums(albums) {
    let addedAlbums = {};
    const skipAlbumTypes = ['single', 'compilation', 'appears_on', 'live', 'remix', 'audiobook'];
    for (let album of albums) {
        if (skipAlbumTypes.includes(album.album_type)) continue;
        //album.name.toLowerCase().includes('live') && 
        if (album.tracks.items.map(track => track.name).every(trackName => trackName.toLowerCase().includes('live'))) continue;

        const albumData = {
            id: album.id,
            artistIds: album.artists.map(artist => artist.id),
            trackIds: album.tracks.items.map(track => track.id),
            popularity: album.popularity,
            releaseDate: album.release_date
        };
        await redisClient.setAlbumData(album.id, albumData);
        addedAlbums[album.id] = albumData;
    }
    return addedAlbums;
}

async function addTracks(tracks) {
    let addedTracks = {};
    for (let track of tracks) {
        if (track.linked_from) continue;

        const trackData = {
            id: track.id,
            popularity: track.popularity,
            artistIds: track.artists.map(artist => artist.id),
            albumId: track.album.id,
            trackNumber: track.track_number
        };
        await redisClient.setTrackData(track.id, trackData);
        addedTracks[track.id] = trackData;
    }
    return addedTracks;
}

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

        artists = {...artists, ...await addArtists(data.artists.items)};

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

        albums = {...albums, ...await addAlbums(data.items.map(item => item.album))};

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

        tracks = {...tracks, ...await addTracks(data.items.map(item => item.track))};

        if (!data.next) break;
        offset += limit;
    }

    return tracks;
}

async function getArtists(accessToken, artistIds) {
    let artists = {};
    let queryArtistIds = [];

    for (let artistId of artistIds) {
        const artistData = await redisClient.getArtistData(artistId);
        if (artistData) {
            artists[artistId] = artistData;
        } else {
            queryArtistIds.push(artistId);
        }
    }

    const limit = 50;
    const artistChunks = [];
    for (let i = 0; i < queryArtistIds.length; i += limit) {
        artistChunks.push(queryArtistIds.slice(i, i + limit));
    }
    
    for (let artistChunk of artistChunks) {
        const data = await fetchWithDelay(`${API_BASE_URL}/artists?ids=${artistChunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        artists = {...artists, ...await addArtists(data.artists)};
    }

    return artists;
}

async function getArtistAlbums(accessToken, artistIds) {
    let artistAlbums = {};
    let queryArtistIds = [];
    
    for (let artistId of artistIds) {
        const artistAlbumData = await redisClient.getArtistAlbumData(artistId);
        if (artistAlbumData) {
            artistAlbums[artistId] = artistAlbumData;
        } else {
            queryArtistIds.push(artistId);
        }
    }

    const limit = 50;
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

        await redisClient.setArtistAlbumData(artistId, albums);
        artistAlbums[artistId] = albums;
    }

    return artistAlbums;
}

async function getAlbums(accessToken, albumIds) {
    let albums = {};
    let queryAlbums = [];

    for (let albumId of albumIds) {
        const albumData = await redisClient.getAlbumData(albumId);
        if (albumData) {
            albums[albumId] = albumData;
        } else {
            queryAlbums.push(albumId);
        }
    }

    const limit = 20;
    const albumChunks = [];
    for (let i = 0; i < queryAlbums.length; i += limit) {
        albumChunks.push(queryAlbums.slice(i, i + limit));
    }

    for (let albumChunk of albumChunks) {
        const data = await fetchWithDelay(`${API_BASE_URL}/albums?ids=${albumChunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        albums = {...albums, ...await addAlbums(data.albums)};
    }

    return albums;
}

async function getTracks(accessToken, trackIds) {
    let tracks = {};
    let queryTracks = [];

    for (let trackId of trackIds) {
        const trackData = await redisClient.getTrackData(trackId);
        if (trackData) {
            tracks[trackId] = trackData;
        } else {
            queryTracks.push(trackId);
        }
    }

    const limit = 50;
    const trackChunks = [];
    for (let i = 0; i < queryTracks.length; i += limit) {
        trackChunks.push(queryTracks.slice(i, i + limit));
    }

    for (let trackChunk of trackChunks) {
        let data = await fetchWithDelay(`https://api.spotify.com/v1/tracks?ids=${trackChunk.join(',')}`, {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        
        tracks = {...tracks, ...await addTracks(data.tracks)};
    }

    return tracks;
}

function getPopularTracks(tracks) {//, numDeviations = 2) {
    const popularityScores = tracks.map((track) => track.popularity);
    const mean = popularityScores.reduce((acc, score) => acc + score, 0) / popularityScores.length;
    const variance = popularityScores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / popularityScores.length;
    const stdDev = Math.sqrt(variance);

    const numDeviations = 2 * (1 - mean * 0.01);// 0 pop mean => 2, 100 pop mean = 0
    const filteredTracks = tracks.filter((track) => track.popularity > mean + numDeviations * stdDev);

    return filteredTracks;

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
        if (track.popularity > upperBound) {
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

// function groupTracksByAlbumId(tracks) {
//     return tracks.reduce((result, track) => {
//         const albumId = track.albumId;
//         if (!result[albumId]) {
//             result[albumId] = [];
//         }
//         result[albumId].push(track);
//         return result;
//     }, {});
// }

export async function execute(accessToken) {
    // let artists = {};
    // let albums = {};
    // let tracks = {};
    
    let tracks = await getLikedTracks(accessToken);
    
    let albums = await getLikedAlbums(accessToken);
    albums = {...albums, ...await getAlbums(accessToken, Object.values(tracks).map(track => track.albumId))};

    let artists = await getLikedArtists(accessToken);
    artists = {...artists, ...await getArtists(accessToken, Object.values(albums).flatMap(album => album.artistIds))};
    let artistAlbums = await getArtistAlbums(accessToken, Object.values(artists).map(artist => artist.id));

    albums = await getAlbums(accessToken, Object.values(artistAlbums).flat());
    let albumsByNames = {};
    Object.values(albums).forEach(album => {
        const albumKey = album.artistId + album.name;
        if (!albumsByNames[albumKey]) albumsByNames[albumKey] = [];
        albumsByNames[albumKey].push(album);
    });
    for (let nameAlbums of Object.values(albumsByNames))
    {
        nameAlbums = nameAlbums.sort((a,b) => a.popularity - b.popularity);
        nameAlbums.shift();
        nameAlbums.forEach(nameAlbum => delete albums[nameAlbum.id]);
    }

    tracks = await getTracks(accessToken, Object.values(albums).flatMap(album => album.trackIds));
    let albumTracks = {};
    Object.values(tracks).forEach(track => {
        if (!albumTracks[track.albumId]) albumTracks[track.albumId] = [];
        albumTracks[track.albumId].push(track);
    });

    let popTracks = Object.values(albumTracks).flatMap(tracks => getPopularTracks(tracks));
    popTracks = popTracks.sort((a, b) => {
        if (a.artistIds[0] != b.artistIds[0]) {
            // i guess this can happen if the main artist is not the album artist???
            let aArtist = artists[a.artistIds.find(artistId => artists[artistId])];
            let bArtist = artists[b.artistIds.find(artistId => artists[artistId])];
            if (!aArtist) return 1;
            if (!bArtist) return -1;
            return aArtist.name < bArtist.name ? -1 : 1;
        }
        if (a.albumId != b.albumId) return albums[a.albumId].releaseDate < albums[b.albumId].releaseDate ? -1 : 1;
        return a.trackNumber - b.trackNumber;
    });

    // let likedArtistIds = likedArtists.map(artist => artist.id);
    // // if a track has one artist, add it to liked artists
    // likedArtistIds = likedArtistIds.concat(likedTracks.filter(track => track.artistIds.length == 1).flatMap(track => track.artistIds));
    // // otherwise add to liked albums to find album artist
    // likedAlbums = likedAlbums.concat(await getAlbums(accessToken, likedTracks.filter(track => track.artistIds.length > 1).map(track => track.albumId)));
    // likedAlbums = Array.from(new Set(likedAlbums.map(album => album.id))).map(id => likedAlbums.find(album => album.id == id));
    // likedArtistIds = likedArtistIds.concat(likedAlbums.flatMap(album => album.artistIds));
    // likedArtistIds = [...new Set(likedArtistIds)];
    // console.log('liked art id: ' + JSON.stringify(likedArtistIds).substring(0, 100));

    // let artistAlbumIds = await getArtistAlbumIds(accessToken, likedArtistIds);
    // console.log('artist albums: ' + JSON.stringify(artistAlbumIdsByArtistId[watchArtistId]));
    // let artistAlbums = await getAlbums(accessToken, Object.values(artistAlbumIdsByArtistId).flat());
    // let artistAlbumTracks = await getTracks(accessToken, artistAlbums.flatMap(album => album.trackIds));
    // artistAlbumTracks = Array.from(new Set(artistAlbumTracks.map(track => track.uri))).map(uri => artistAlbumTracks.find(track => track.uri == uri));
    // let artistAlbumTracksByAlbumId = groupTracksByAlbumId(artistAlbumTracks);

    // let popularTracks = Object.values(popularTracksByAlbumId).flat();
    // console.log('Popular tracks: ' + JSON.stringify(popularTracks).substring(0, 100));

    await createPlaylist(accessToken, 'Pop Spot', 'Liked Artist Popular Tracks', popTracks.map(track => `spotify:track:${track.id}`));
}