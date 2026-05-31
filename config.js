const FILE_HOST = process.env.FILE_HOST_URL || 'https://femboy.beauty';

module.exports = {
  allowedHost: process.env.ALLOWED_HOST || 'localhost:3000',
  PORT: process.env.PORT || 3000,
  fileHostUrl: FILE_HOST,
  videoTypes: (process.env.VIDEO_TYPES || 'mp4,webm,mov,avi,mkv').split(','),
  imageTypes: (process.env.IMAGE_TYPES || 'jpg,jpeg,png,gif,webp').split(','),
  siteDescription: process.env.SITE_DESCRIPTION || 'girlglock.com',
};
