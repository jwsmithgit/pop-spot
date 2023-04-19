import redis from 'redis';

class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }
  
  acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }
  
  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.locked = false;
    }
  }
}

let instance = null;

class RedisClient {
  constructor(redisUrl) {
    if (!instance) {
      instance = this;
      this.client = {};
      this.mutex = new Mutex();
    }

    return instance;
    // this.client = redis.createClient({ url: redisUrl });
  }

  async connect() {
    // if (this.client.isOpen) return;
    // await this.client.connect();
  }

  async release() {
    // if (this.client.isOpen) return;
    // await this.client.connect();
  }

  async setData(key, id, data) {
    await this.mutex.acquire();
    this.client[`${key}:${id}`] = JSON.stringify(data);
    this.mutex.release();
    // await this.connect();
    // return await this.client.set(`${key}:${id}`, JSON.stringify(data));
  }

  async getData(key, id) {
    await this.mutex.acquire();
    console.log(`redis: ${key}`);
    let data = this.client[`${key}:${id}`];
    this.mutex.release();
    return data ? JSON.parse(data) : null;
    // await this.connect();
    // console.log(`redis: ${key}`);
    // let data = await this.client.get(`${key}:${id}`);
    // return data ? JSON.parse(data) : null;
  }

  async setArtistData(artistId, data) {
    return await this.setData('artist', artistId, data);
  }

  async getArtistData(artistId) {
    return await this.getData('artist', artistId);
  }
  
  async setArtistAlbumData(artistId, data) {
    return await this.setData('artist:album', artistId, data);
  }

  async getArtistAlbumData(artistId) {
    return await this.getData('artist:album', artistId);
  }

  async setAlbumData(albumId, data) {
    return await this.setData('album', albumId, data);
  }

  async getAlbumData(albumId) {
    return await this.getData('album', albumId);
  }

  async setTrackData(trackId, data) {
    return await this.setData('track', trackId, data);
  }

  async getTrackData(trackId) {
    return await this.getData('track', trackId);
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
