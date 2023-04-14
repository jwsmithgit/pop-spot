import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import * as url from 'url';
import { getAuthorizationUrl, authenticate } from '../auth/spotify-auth.js';
import { execute } from '../scripts/pop-spot.js';

dotenv.config();
const router = express.Router();
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

if (!process.env.SPOTIFY_CLIENT_ID) {
    console.error('SPOTIFY_CLIENT_ID environment variable not set');
    process.exit(1);
}

if (!redirectUri) {
    console.error('SPOTIFY_REDIRECT_URI environment variable not set');
    process.exit(1);
}

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

router.get('/login', (req, res) => {
    const state = Math.random().toString(36).substring(2, 15);
  req.session.state = state;

  const authUrl = getAuthorizationUrl(state);
  res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.session.state || null;

    if (state === null || state !== storedState) {
        res.redirect('/error');
    } else {
        req.session.state = null;

        try {
            const { accessToken, refreshToken } = await authenticate(code);
            req.session.accessToken = accessToken;
            req.session.refreshToken = refreshToken;
            res.redirect('/success');
        } catch (error) {
            console.error(error);
            res.redirect('/error');
        }
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