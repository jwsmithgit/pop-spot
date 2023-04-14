import express from 'express';
import path from 'path';
import session from 'express-session';
import router from './routes/index.js';

const app = express();

app.use(express.static(path.join(process.cwd(), 'public')));
app.use(session({
  secret: process.env.APP_SECRET,
  resave: false,
  saveUninitialized: true,
}));

app.use('/', router);

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

export default app;