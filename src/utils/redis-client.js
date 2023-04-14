import redis from 'redis';

class RedisClient {
  constructor(redisUrl) {
    this.client = redis.createClient({ url: redisUrl });
  }

  setAlbumData(albumId, data) {
    return this.client.set(`album:${albumId}`, JSON.stringify(data));
  }

  getAlbumData(albumId) {
    return this.client.get(`album:${albumId}`).then((data) => (data ? JSON.parse(data) : data));
  }

  setTrackData(trackId, data) {
    return this.client.set(`track:${trackId}`, JSON.stringify(data));
  }

  getTrackData(trackId) {
    return this.client.get(`track:${trackId}`).then((data) => (data ? JSON.parse(data) : data));
  }
}

const redisClient = new RedisClient(process.env.REDIS_URL);
export { redisClient };

// import redis from 'redis';
// import { createPool } from 'generic-pool';

// class RedisClientManager {
//   constructor(redisUrl) {
//     this.redisUrl = redisUrl;
//     this.pool = createPool({
//       create: () => redis.createClient({ url: this.redisUrl }),
//       destroy: (client) => client.quit(),
//     });
//   }

//   async getClient() {
//     const client = await this.pool.acquire();
//     return {
//       client,
//       release: () => this.pool.release(client),
//     };
//   }
// }

// const redisClientManager = new RedisClientManager(process.env.REDIS_URL);

// // Save album data by album ID
// const saveAlbumData = async (albumId, data) => {
//   try {
//     const { client, release } = await redisClientManager.getClient();
//     await client.set(`album:${albumId}`, JSON.stringify(data));
//     release();
//   } catch (err) {
//     console.error(err);
//   }
// };

// // Retrieve album data by album ID
// const getAlbumData = async (albumId) => {
//   try {
//     const { client, release } = await redisClientManager.getClient();
//     const data = await client.get(`album:${albumId}`);
//     release();
//     return data ? JSON.parse(data) : data;
//   } catch (err) {
//     console.error(err);
//   }
// };

// // Save track data by track ID
// const saveTrackData = async (trackId, data) => {
//   try {
//     const { client, release } = await redisClientManager.getClient();
//     await client.set(`track:${trackId}`, JSON.stringify(data));
//     release();
//   } catch (err) {
//     console.error(err);
//   }
// };

// // Retrieve track data by track ID
// const getTrackData = async (trackId) => {
//   try {
//     const { client, release } = await redisClientManager.getClient();
//     const data = await client.get(`track:${trackId}`);
//     release();
//     return data ? JSON.parse(data) : data;
//   } catch (err) {
//     console.error(err);
//   }
// };

// export { saveAlbumData, getAlbumData, saveTrackData, getTrackData };
