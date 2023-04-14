import express from 'express';
import path from 'path';
import request from 'request';
import session from 'express-session';
import * as url from 'url';
import {execute} from './scripts/pop-spot.js'

const app = express();
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const clientId = 'a02434801a964928b903cf894c58151e';
const clientSecret = '88aa185cd0c94b50beec7a0f908e2e7e';
const redirectUri = 'https://warm-wave-05889.herokuapp.com/callback';

app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'banana',
    resave: false,
    saveUninitialized: true
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Set up the Spotify login
app.get('/login', (req, res) => {
    const state = Math.random().toString(36).substring(2, 15);
    req.session.state = state;
    const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private user-library-read';
    const url = 'https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + clientId +
        '&scope=' + encodeURIComponent(scope) +
        '&redirect_uri=' + encodeURIComponent(redirectUri) +
        '&state=' + state;
    res.redirect(url);
});

app.get('/callback', (req, res) => {
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
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
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

app.get('/success', (req, res) => {
    // Use req.session.accessToken to make API requests to Spotify on behalf of the user
    res.send('Authenticated');

    execute(req.session.accessToken);
});

app.get('/error', (req, res) => {
    res.send('Authentication error');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});