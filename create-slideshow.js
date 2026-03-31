const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const inputDir = path.join(__dirname, 'public', 'slideshow-images');
const outputFile = path.join(__dirname, 'public', 'slideshow.mp4');
const bgmFile = path.join(__dirname, 'bgm.mp3');

// Get all jpg files
const files = fs.readdirSync(inputDir)
  .filter(file => file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg'))
  .sort((a, b) => {
    // Extract numbers for better sorting (e.g., _2.jpg after _1.jpg, not after _11.jpg)
    const numA = parseInt(a.match(/(\d+)/)?.[0] || 0);
    const numB = parseInt(b.match(/(\d+)/)?.[0] || 0);
    return numA - numB;
  });

if (files.length === 0) {
  console.error('No images found in public/slideshow-images');
  process.exit(1);
}

console.log(`Found ${files.length} images. Starting video creation...`);

const command = ffmpeg();

// Duration per image in seconds
const durationPerImage = 4;

// We'll use a temporary file for the concat demuxer to handle 50+ images easily
const listFilePath = path.join(__dirname, 'images.txt');
let listContent = '';

files.forEach(file => {
  const filePath = path.join(inputDir, file).replace(/\\/g, '/');
  listContent += `file '${filePath}'\n`;
  listContent += `duration ${durationPerImage}\n`;
});
// The last file needs to be repeated once without duration to stop the concat demuxer correctly
const lastFile = path.join(inputDir, files[files.length - 1]).replace(/\\/g, '/');
listContent += `file '${lastFile}'\n`;

fs.writeFileSync(listFilePath, listContent);

command
  .input(listFilePath)
  .inputOptions(['-f concat', '-safe 0'])
  // Adding BGM if it exists
  .on('start', (commandLine) => {
    console.log('Spawned Ffmpeg with command: ' + commandLine);
  })
  .on('progress', (progress) => {
    console.log(`Processing: ${progress.percent}% done`);
  })
  .on('error', (err) => {
    console.error('Error: ' + err.message);
    if (fs.existsSync(listFilePath)) fs.unlinkSync(listFilePath);
  })
  .on('end', () => {
    console.log('Finished processing!');
    if (fs.existsSync(listFilePath)) fs.unlinkSync(listFilePath);
  });

// Add audio if exists
if (fs.existsSync(bgmFile)) {
  command.input(bgmFile).inputOptions(['-stream_loop -1']).audioCodec('aac').format('mp4').outputOptions(['-shortest']);
}

command
  .videoCodec('libx264')
  .outputOptions([
    '-pix_fmt yuv420p',
    '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p'
  ])
  .save(outputFile);
