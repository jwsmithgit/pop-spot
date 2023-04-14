import redis from 'redis';
import { promisify } from 'util';

class RedisPool {
  constructor({ url, maxConnections = 20 }) {
    this.url = url;
    this.maxConnections = maxConnections;
    this.pool = [];
    this.createClient = promisify(redis.createClient);
  }

  async acquire() {
    if (this.pool.length < this.maxConnections) {
      const client = await this.createClient(this.url);
      this.pool.push(client);
      console.log(`New connection added to pool (pool size: ${this.pool.length})`);
    }

    return this.pool.pop();
  }

  release(client) {
    this.pool.push(client);
    console.log(`Connection returned to pool (pool size: ${this.pool.length})`);
  }
}

const pool = new RedisPool({ url: process.env.REDIS_URL });

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
  await client.set(`album:${albumId}`, JSON.stringify(data));
  releaseClient(client);
};

// Retrieve album data by album ID
const getAlbumData = async (albumId) => {
  const client = await getClient();
  const data = await client.get(`album:${albumId}`);
  client.release();
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
