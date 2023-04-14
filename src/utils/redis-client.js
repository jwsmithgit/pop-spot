import redis from 'redis';

class RedisPool {
  constructor({ url, maxConnections = 20 }) {
    this.url = url;
    this.maxConnections = maxConnections;
    this.pool = [];
  }

  async acquire() {
    console.log('Acquiring client from pool (pool size: ' + this.pool.length + ')');
    if (this.pool.length < this.maxConnections) {
      const client = redis.createClient({ url: this.url });
      this.pool.push(client);
      console.log(`New connection added to pool (pool size: ${this.pool.length})`);
    }

    const client = this.pool.pop();
    await client.connect();
    console.log('Acquired client from pool (pool size: ' + this.pool.length + ')');
    return client;
  }

  release(client) {
    client.quit();
    this.pool.push(client);
    console.log(`Connection returned to pool (pool size: ${this.pool.length})`);
  }
}

const pool = new RedisPool({ url: process.env.REDIS_URL });

const getClient = async () => {
  const client = await pool.acquire();
  return client;
};

const releaseClient = (client) => {
  pool.release(client);
};

// Save album data by album ID
const saveAlbumData = async (albumId, data) => {
  const client = await getClient();
  await client.set(`album:${albumId}`, JSON.stringify(data));
  releaseClient(client);
};

// Retrieve album data by album ID
const getAlbumData = async (albumId) => {
  console.log('asking for album: ' + albumId);
  const client = await getClient();
  console.log('have client');
  const data = await client.get(`album:${albumId}`);
  console.log('have data');
  client.release();
  console.log('release');
  return data ? JSON.parse(data) : data;
};

// Save track data by track ID
const saveTrackData = async (trackId, data) => {
  const client = await getClient();
  await client.set(`track:${trackId}`, JSON.stringify(data));
  client.release();
};

// Retrieve track data by track ID
const getTrackData = async (trackId) => {
  const client = await getClient();
  const data = await client.get(`track:${trackId}`);
  client.release();
  return data ? JSON.parse(data) : data;
};

export { saveAlbumData, getAlbumData, saveTrackData, getTrackData };
