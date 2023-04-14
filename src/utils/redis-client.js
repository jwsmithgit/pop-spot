import redis from 'redis';

const client = redis.createClient(process.env.REDIS_URL);

client.on('connect', () => {
  console.log('Redis client connected');
});

client.on('error', (err) => {
  console.error('Redis error:', err);
});

// Save album data by album ID
const saveAlbumData = (albumId, data) => {
  client.set(`album:${albumId}`, JSON.stringify(data));
};

// Retrieve album data by album ID
const getAlbumData = (albumId, callback) => {
  client.get(`album:${albumId}`, (err, data) => {
    if (err) throw err;
    callback(JSON.parse(data));
  });
};

// Save track data by track ID
const saveTrackData = (trackId, data) => {
  client.set(`track:${trackId}`, JSON.stringify(data));
};

// Retrieve track data by track ID
const getTrackData = (trackId, callback) => {
  client.get(`track:${trackId}`, (err, data) => {
    if (err) throw err;
    callback(JSON.parse(data));
  });
};

export { saveAlbumData, getAlbumData, saveTrackData, getTrackData };
