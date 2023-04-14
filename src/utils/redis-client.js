import redis from 'redis';

class RedisPool {
  constructor({ url, maxConnections = 20 }) {
    this.url = url;
    this.maxConnections = maxConnections;
    this.pool = [];
    this.connections = [];
    this.waiting = [];
  }

  async acquire() {
    console.log('Acquiring client from pool (pool size: ' + this.pool.length + ')');
    if (this.pool.length < this.maxConnections) {
      const client = redis.createClient({ url: this.url });
      this.pool.push(client);
      console.log(`New connection added to pool (pool size: ${this.pool.length})`);
    }

    const client = this.pool.pop();
    if (client)
    {
      await client.connect();
      console.log('Acquired client from pool (pool size: ' + this.pool.length + ')');
      this.connections.push(client);
      console.log(`New connection added to connections (connections size: ${this.connections.length})`);
      return client;
    }
    else
    {
      console.log(`No available connections, waiting...`);
      return new Promise((resolve) => {
        this.waiting.push(resolve);
      }).then(() => this.acquire());
    }
  }

  release(client) {
    client.quit();
    const index = this.connections.indexOf(client);
    if (index !== -1) {
      this.connections.splice(index, 1);
      console.log(`Connection removed from connections (connections size: ${this.connections.length})`);
    }
    this.pool.push(client);
    console.log(`Connection returned to pool (pool size: ${this.pool.length})`);
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve(this.acquire());
    }
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
  releaseClient(client);
  console.log('release');
  return data ? JSON.parse(data) : data;
};

// Save track data by track ID
const saveTrackData = async (trackId, data) => {
  const client = await getClient();
  await client.set(`track:${trackId}`, JSON.stringify(data));
  releaseClient(client);
};

// Retrieve track data by track ID
const getTrackData = async (trackId) => {
  const client = await getClient();
  const data = await client.get(`track:${trackId}`);
  releaseClient(client);
  return data ? JSON.parse(data) : data;
};

export { saveAlbumData, getAlbumData, saveTrackData, getTrackData };
