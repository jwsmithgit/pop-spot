import request from 'request';
import url from 'url';

// Spotify authentication URL
export function getAuthorizationUrl(state) {
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private user-library-read';
  
    const authUrl = new url.URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', process.env.SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
  
    return authUrl.toString();
  }

// Spotify authentication flow
export function authenticate(code, state) {
    return new Promise((resolve, reject) => {
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
            },
            json: true
        };

        request.post(authOptions, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                const accessToken = body.access_token;
                const refreshToken = body.refresh_token;
                resolve({ accessToken, refreshToken });
            } else {
                reject(error || 'Invalid authentication request');
            }
        });
    });
}

// Refresh Spotify access token
export function refreshAccessToken(refreshToken) {
    return new Promise((resolve, reject) => {
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
            },
            form: {
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            },
            json: true
        };

        request.post(authOptions, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                const accessToken = body.access_token;
                resolve(accessToken);
            } else {
                reject(error || 'Invalid token refresh request');
            }
        });
    });
}
