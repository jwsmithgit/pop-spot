import express from 'express';
import path from 'path';
const app = express();

app.use(express.static(path.join(new URL(import.meta.url).pathname, 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});