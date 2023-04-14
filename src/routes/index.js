import express from 'express';
import path from 'path';
import request from 'request';
import * as url from 'url';
import { execute } from '../scripts/pop-spot.js';

const router = express.Router();
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Set up the Spotify login
router.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  req.session.state = state;
  const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private user-library-read';
  const url = 'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + process.env.SPOTIFY_CLIENT_ID +
    '&scope=' + encodeURIComponent(scope) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&state=' + state;
  res.redirect(url);
});

router.get('/callback', (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.session.state || null;

  if (state === null || state !== storedState) {
    res.redirect('/error');
  } else {
    req.session.state = null;
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
        req.session.accessToken = accessToken;
        req.session.refreshToken = refreshToken;
        res.redirect('/success');
      } else {
        res.redirect('/error');
      }
    });
  }
});

router.get('/success', (req, res) => {
  // Use req.session.accessToken to make API requests to Spotify on behalf of the user
  res.send('Authenticated');

  execute(req.session.accessToken);
});

router.get('/error', (req, res) => {
  res.send('Authentication error');
});

export default router;