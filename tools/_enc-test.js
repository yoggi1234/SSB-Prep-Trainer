'use strict';

// Throwaway measurement: how small can we get the Met's 600px JPEGs while
// keeping them perfectly readable as an on-screen TAT picture?
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '.tmpimg');

function main() {
  let files = [];
  try {
    files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.jpg'));
  } catch (err) {
    console.log('cannot read ' + SRC + ': ' + err.message);
    return;
  }
  console.log('source files:', files.length);
  for (const width of [560, 480]) {
    for (const quality of [72, 62]) {
      let total = 0;
      let ok = 0;
      const sizes = [];
      for (const f of files) {
        try {
          const img = nativeImage.createFromBuffer(fs.readFileSync(path.join(SRC, f)));
          if (img.isEmpty()) continue;
          const out = img.resize({ width, quality: 'good' }).toJPEG(quality);
          total += out.length;
          ok++;
          sizes.push(Math.round(out.length / 1024) + 'KB');
        } catch (err) {
          console.log('  failed on ' + f + ': ' + err.message);
        }
      }
      if (!ok) continue;
      const avg = Math.round(total / ok / 1024);
      console.log(
        'width=' + width + ' q=' + quality +
        '  avg=' + avg + 'KB' +
        '  2000 images ~= ' + Math.round(((total / ok) * 2000) / 1048576) + 'MB' +
        '  [' + sizes.join(' ') + ']'
      );
    }
  }
}

app
  .whenReady()
  .then(main)
  .catch((err) => console.log('ERROR: ' + err.message))
  .then(() => {
    app.exit(0);
  });
