const fs = require('fs');
const prompt = require('prompt');
const util = require('util');

const config = require('./config');
const utils = require('./utils');
const validators = require('./validators');

const promptGetAsync = util.promisify(prompt.get);

async function addClient() {
  if (!process.argv[4]) {
    console.error('Client name not specified');
    return;
  }

  const clientName = process.argv[4];

  if (!validators.IsGenericNameValid(clientName)) {
    return;
  }

  console.info(`Creating new client: ${clientName}`);

  const dirName = `./core/clients/${clientName}`;

  if (fs.existsSync(dirName)) {
    console.error(`Directory already exists: ${dirName}`);
    return;
  }

  //========== user input =======================================================
  const properties = [
    {
      name: 'imagename',
      description: 'Docker image name (e.g. mysql:latest)',
      // validator: /^[a-zA-Z0-9:\s\-]+$/,
      // warning: 'Image name must be only letters, spaces, or dashes'
      required: true,
    },
    /*
    {
      name: 'password',
      hidden: true
    }
    */
  ];

  prompt.start();

  /*
  prompt.get(properties, function (err, result) {
    if (err) { return console.log(err); }

    console.log('Image name: ' + result.imagename);
  });
  */

  let input;

  try {
    input = await promptGetAsync(properties);
  }
  catch(err) {
    return console.error(err);
  }

  //=============================================================================
  fs.mkdirSync(dirName, {recursive: true});

  console.info(`Generating ${config.STACK_CLIENT_MANIFEST}`);

  const manifest = {
    "docker": {
      "image": input.imagename,
      "ports": [],
      // "volume": "/data/db",
      "env": {
        "start": {
        },
        "connect": {
        }
      }
    }
  
  }

  fs.writeFileSync(`${dirName}/${config.STACK_CLIENT_MANIFEST}`, JSON.stringify(manifest, null, 2));

  //========== copy content =====================================================
  utils.hr();
  console.info('Copying components...');

  await utils.copyFilesRootAsync('templates/add-client/*', `./${dirName}`, 2);

  //========== info ===============================================
  utils.hr();
  console.info(`Success! Created ${clientName} client in ${fs.realpathSync(dirName)}`);
  console.info(`You can now add "${clientName}" as a dependency to the services in ${config.STACK_CONFIG}`);
}

module.exports = addClient;