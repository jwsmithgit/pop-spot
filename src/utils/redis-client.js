import RedisPool from 'redis-pool';

const pool = RedisPool('myRedisPool', {
  url: process.env.REDIS_URL,
  max_clients: 20,
  perform_check: false,
});

const getClient = () => {
  return new Promise((resolve, reject) => {
    pool.acquire((err, client) => {
      if (err) {
        return reject(err);
      }
      return resolve(client);
    });
  });
};

const releaseClient = (client) => {
  pool.release(client);
};

// Save album data by album ID
const saveAlbumData = async (albumId, data) => {
  const client = await getClient();
  client.set(`album:${albumId}`, JSON.stringify(data), (err) => {
    if (err) {
      console.error('Error saving album data:', err);
    }
    releaseClient(client);
  });
};

// Retrieve album data by album ID
const getAlbumData = async (albumId) => {
  const client = await getClient();
  return new Promise((resolve, reject) => {
    client.get(`album:${albumId}`, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
      releaseClient(client);
    });
  });
};

// Save track data by track ID
const saveTrackData = async (trackId, data) => {
  const client = await getClient();
  client.set(`track:${trackId}`, JSON.stringify(data), (err) => {
    if (err) {
      console.error('Error saving track data:', err);
    }
    releaseClient(client);
  });
};

// Retrieve track data by track ID
const getTrackData = async (trackId) => {
  const client = await getClient();
  return new Promise((resolve, reject) => {
    client.get(`track:${trackId}`, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
      releaseClient(client);
    });
  });
};

export { saveAlbumData, getAlbumData, saveTrackData, getTrackData };
