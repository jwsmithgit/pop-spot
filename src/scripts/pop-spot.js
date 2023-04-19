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
        let artistData = {
            id: artist.id,
            name: artist.name,
            popularity: artist.popularity
        };
        if (artist.genres.some(genre => skipGenres.includes(genre))) artistData = 'x';
        await redisClient.setArtistData(artist.id, artistData);
        if (artistData == 'x') continue;
        addedArtists[artist.id] = artistData;
    }
    return addedArtists;
}

async function addAlbums(albums) {
    let addedAlbums = {};
    const skipAlbumTypes = ['compilation', 'appears_on', 'live', 'remix', 'audiobook'];
    for (let album of albums) {
        //album.name.toLowerCase().includes('live') && 
        // if (album.tracks.items.map(track => track.name).every(trackName => trackName.toLowerCase().includes('live'))) continue;
        let albumData = {
            id: album.id,
            artistIds: album.artists.map(artist => artist.id),
            trackIds: album.tracks.items.map(track => track.id),
            popularity: album.popularity,
            releaseDate: album.release_date
        };
        if (skipAlbumTypes.includes(album.album_type)) albumData = 'x';
        if (album.artists.length > 1) albumData = 'x';
        await redisClient.setAlbumData(album.id, albumData);
        if (albumData == 'x') continue;
        addedAlbums[album.id] = albumData;
    }
    return addedAlbums;
}

async function addTracks(tracks) {
    let addedTracks = {};
    for (let track of tracks) {
        let trackData = {
            id: track.id,
            artistIds: track.artists.map(artist => artist.id),
            albumId: track.album.id,
            popularity: track.popularity,
            trackNumber: track.track_number
        };
        if (track.linked_from) trackData = 'x';
        await redisClient.setTrackData(track.id, trackData);
        if (trackData == 'x') continue;
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
        if (artistData == 'x') continue;
        if (artistData) artists[artistId] = artistData;
        else queryArtistIds.push(artistId);
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
        if (artistAlbumData == 'x') continue;
        if (artistAlbumData) artistAlbums[artistId] = artistAlbumData;
        else queryArtistIds.push(artistId);
    }

    const limit = 50;
    for (let artistId of queryArtistIds) {
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
        if (albumData == 'x') continue;
        if (albumData) albums[albumId] = albumData;
        else queryAlbums.push(albumId);
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
        if (trackData == 'x') continue;
        if (trackData) tracks[trackId] = trackData;
        else queryTracks.push(trackId);
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

function getPopTracks(tracks, albums, artists) {
    let popTracks = [];

    // Calculate the mean popularity score for each album
    const albumTrackPopularityScores = Object.values(albums).reduce((acc, album) => {
        const albumTrackPopularityScores = album.trackIds.map((trackId) => tracks[trackId].popularity);
        const albumTrackPopularityMean  = albumTrackPopularityScores.reduce((acc, score) => acc + score, 0) / albumTrackPopularityScores.length;
        const albumTrackPopularityDeviation = Math.sqrt(albumTrackPopularityScores.reduce((acc, score) => acc + Math.pow(score - albumTrackPopularityMean, 2), 0) / albumTrackPopularityScores.length);
        acc[album.id] = { mean: albumTrackPopularityMean, deviation: albumTrackPopularityDeviation };
        return acc;
    }, {});

    // Calculate the mean popularity score for all albums by each artist
    const artistAlbumPopularityScores = Object.values(artists).reduce((acc, artist) => {
        const artistAlbumPopularityScores = artist.albumIds.map((albumId) => albums[albumId].popularity);
        const artistAlbumPopularityMean = artistAlbumPopularityScores.reduce((acc, score) => acc + score, 0) / artistAlbumPopularityScores.length;
        const artistAlbumPopularityDeviation = Math.sqrt(artistAlbumPopularityScores.reduce((acc, score) => acc + Math.pow(score - artistAlbumPopularityMean, 2), 0) / artistAlbumPopularityScores.length);
        acc[artist.id] = { mean: artistAlbumPopularityMean, deviation: artistAlbumPopularityDeviation };
        return acc;
      }, {});
      
    // Calculate the mean popularity score for all artists
    const artistPopularityScores = Object.values(artists).map((artist) => artist.popularity);
    const meanArtistPopularity = artistPopularityScores.reduce((acc, score) => acc + score, 0) / artistPopularityScores.length;
    
    // Loop over each album
    for (let artistId in artists) {
        const artistAlbumPopularity = artistAlbumPopularityScores[artistId];
        // const meanArtistAlbumTrackPopularity = artists[artistId].trackIds.map(albumId => albumTrackPopularityScores[albumId]).reduce((sum, score, index, array) => sum + score / array.length, 0);
        
        let artistAlbums = artists[artistId].albumIds.map(albumId => albums[albumId]);
        const artistAlbumPopularityMin = Math.min(...artistAlbums.map(album => album.popularity));
        const artistAlbumPopularityMax = Math.max(...artistAlbums.map(album => album.popularity));
        artistAlbums = artistAlbums.sort((a, b) => b.popularity - a.popularity);
        // let numDev = 1;
        for (let album of artistAlbums) {
            const albumTrackPopularity = albumTrackPopularityScores[album.id];
            if (albumTrackPopularity.deviation == 0) continue;
            
            // let albumDeviations = (album.popularity - artistAlbumPopularity.mean) / artistAlbumPopularity.deviation;
            // if (albumTrackPopularity.mean < artistAlbumPopularity.mean - 1 * artistAlbumPopularity.deviation) continue;

            // if (album.popularity < artistAlbumPopularity.mean + artistAlbumPopularity.deviation) numDev += 1;
            // else numDev += 1;

            // let numDev = 1;
            // // if (album.popularity < artistAlbumPopularity.mean + artistAlbumPopularity.deviation) numDev += 0.5;
            // // numDev += (1 - (album.popularity * 0.01));
            // // get rank
            // numDev += artistAlbums.indexOf(album) / Math.max(10, artistAlbums.length);
            // // get popularity compared to most popular
            // //if (artistAlbumPopularityMax != artistAlbumPopularityMin) 
            // numDev += (artistAlbumPopularityMax - album.popularity) / 100;

            if (album.id == '0JyEWuZBMpLOezjt2DDt8M')
            {
                console.log('log');
                console.log(JSON.stringify(albums.map(album => album.popularity)));
                console.log(JSON.stringify(tracks.map(track => track.popularity)));
            }

            // if (album.id == '2YSBHo8EgsejAGlmoyChJR')
            // {
            //     console.log('log');
            //     console.log(numDev);
            //     console.log(albumTrackPopularity.mean);
            //     console.log(albumTrackPopularity.deviation);
            //     console.log(albumTrackPopularity.mean + numDev * albumTrackPopularity.deviation);
            //     console.log(JSON.stringify(album.trackIds.map(trackId => tracks[trackId])));
            //     // console.log(album.popularity);
            //     // console.log(albumDeviations);
            //     // console.log(albumTrackPopularity.mean + (10 * - Math.max(0, albumDeviations)) * albumTrackPopularity.deviation);
            // }

            let albumDeviation = artistAlbumPopularity.mean + artistAlbumPopularity.deviation;
            let albumDiff = Math.max(0, albumDeviation - album.popularity);

            // If there are any tracks on the album, add the most popular ones
            // (albumTrackPopularity.mean / meanArtistAlbumTrackPopularity) * 
            let numTracks = Math.ceil((album.popularity / artistAlbumPopularity.mean) * (artists[artistId].popularity / meanArtistPopularity));
            if (numTracks > 0) {
                let sortedTracks = album.trackIds.map(trackId => tracks[trackId]).sort((a, b) => b.popularity - a.popularity);
                // sortedTracks = sortedTracks.slice(0, numTracks);
                for (let track of sortedTracks)
                {
                    // (artists[artistId].albumIds.length * -albumDeviations)
                    if (track.popularity < albumTrackPopularity.mean + albumTrackPopularity.deviation + albumDiff) continue;//numDev * albumTrackPopularity.deviation) continue;
                    popTracks.push(track);
                }
            }
        }
    }
    
    return popTracks;
}


// function getArtistDev(artists) {
//     const popularityScores = artists.map((artist) => artist.popularity);
//     const mean = popularityScores.reduce((acc, score) => acc + score, 0) / popularityScores.length;
//     const variance = popularityScores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / popularityScores.length;
//     const stdDev = Math.sqrt(variance);
//     const numDev = mean * 0.01;// 0 pop mean => 0, 100 pop mean = 1
//     return numDev;
// }

// function getAlbumDev(albums) {
//     const popularityScores = albums.map((album) => album.popularity);
//     const mean = popularityScores.reduce((acc, score) => acc + score, 0) / popularityScores.length;
//     const variance = popularityScores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / popularityScores.length;
//     const stdDev = Math.sqrt(variance);
//     const numDev = (1 - mean * 0.01);// 0 pop mean => 1, 100 pop mean = 0
//     return numDev;
// }

// function getPopTracks(tracks, albumDev, artistDev) {
//     const popularityScores = tracks.map((track) => track.popularity);
//     const mean = popularityScores.reduce((acc, score) => acc + score, 0) / popularityScores.length;
//     const variance = popularityScores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / popularityScores.length;
//     const stdDev = Math.sqrt(variance);
//     const numDev = (1 - mean * 0.01);
//     return tracks.filter((track) => track.popularity >= mean + stdDev * (numDev + albumDev + artistDev));
// }

// const minPopularity = Math.min(...tracks.map(track => track.popularity));
// const maxPopularity = Math.max(...tracks.map(track => track.popularity));
// if (minPopularity == maxPopularity) return [];
// const popularity = minPopularity + (maxPopularity - minPopularity) * 0.9;
// return tracks.filter(track => track.popularity >= popularity);
// function getOutlierTracks(tracks) {
//     // Step 1: Sort the data
//     const sorted = tracks.sort((a, b) => a.popularity - b.popularity);

//     // Step 2: Calculate Q1 and Q3
//     const q1Index = Math.floor(sorted.length / 4);
//     const q3Index = Math.floor(3 * sorted.length / 4);
//     const q1 = sorted[q1Index].popularity;
//     const q3 = sorted[q3Index].popularity;

//     // Step 3: Calculate IQR
//     const iqr = q3 - q1;

//     // // Step 4: Calculate lower outlier boundary
//     // const lowerBound = q1 - 1.5 * iqr;

//     // Step 5: Calculate upper outlier boundary
//     const upperBound = q3 + 1.5 * iqr;

//     // Step 6: Identify outliers
//     const outliers = [];
//     for (const track of tracks) {
//         // if (number < lowerBound || number > upperBound) {
//         if (track.popularity > upperBound) {
//             outliers.push(track);
//         }
//     }

//     return outliers;
// }

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

export async function execute(accessToken) {    
    let tracks = await getLikedTracks(accessToken);
    
    let albums = await getLikedAlbums(accessToken);
    albums = {...albums, ...await getAlbums(accessToken, Object.values(tracks).map(track => track.albumId))};

    let artists = await getLikedArtists(accessToken);
    artists = {...artists, ...await getArtists(accessToken, Object.values(albums).flatMap(album => album.artistIds))};
    let artistAlbums = await getArtistAlbums(accessToken, Object.values(artists).map(artist => artist.id));
    for (let artistId in artistAlbums) artists[artistId].albumIds = artistAlbums[artistId];

    albums = await getAlbums(accessToken, Object.values(artists).map(artist => artist.albumIds).flat());
    for (let artistId in artists) artists[artistId].albumIds = artists[artistId].albumIds.filter(albumId => albums[albumId]);

    // let popAlbums = Object.values(artistAlbums).flatMap(albumIds => getPopAlbums(albumIds.map(albumId => albums[albumId]).filter(album => album)));
    // popAlbums = popAlbums.filter(album => album.artistIds.length == 1);

    tracks = await getTracks(accessToken, Object.values(albums).flatMap(album => album.trackIds));
    // for (let )
    // let albumTracks = {};
    // Object.values(tracks).forEach(track => {
    //     if (!albumTracks[track.albumId]) albumTracks[track.albumId] = [];
    //     albumTracks[track.albumId].push(track.id);
    // });

    let popTracks = getPopTracks(tracks, albums, artists);

    // const artistDev = getArtistDev(Object.values(artists));
    // const albumDev = {};
    // for (let artistId in artistAlbums) albumDev[artistId] = getAlbumDev(artistAlbums[artistId].map(albumId => albums[albumId]).filter(album => album))
    // let popTracks = [];
    // for (let albumId in albumTracks) popTracks = popTracks.concat(getPopTracks(albumTracks[albumId], albumDev[albums[albumId].artistIds.find(artistId => artists[artistId])], artistDev));
    
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

    // console.log('Popular tracks: ' + JSON.stringify(popularTracks).substring(0, 100));
    await createPlaylist(accessToken, 'Pop Spot', 'Liked Artist Popular Tracks', popTracks.map(track => `spotify:track:${track.id}`));
}