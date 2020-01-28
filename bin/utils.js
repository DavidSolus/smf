const fs = require('fs');
const path = require('path');
const copyfiles = require('copyfiles');
const {execSync} = require('child_process');

const config = require('./config');

function exec(cmd) {
  return execSync(cmd, {
    stdio: 'inherit',
  });
}

function buildEnvFiles() {
  fs.mkdirSync(stackBuildEnvPath(), {recursive: true});

  let stackEnv;
  try {
    const data = fs.readFileSync(config.STACK_ENV);
    stackEnv = JSON.parse(data);
  }
  catch(error) {
    console.error(`File not found: ${config.STACK_ENV}`);
    return;
  }

  for(const service of Object.keys(stackEnv.services)) {
    createEnvFile(serviceEnvFileName(service), stackEnv.services[service]);
  }
  
  for(const client of Object.keys(stackEnv.clients)) {
    const varPreffix = client.replace(config.STACK_CLIENT_NAME_SEPARATOR, '_').toUpperCase();
    const clientNameNormalized = client.replace(config.STACK_CLIENT_NAME_SEPARATOR, '-');

    if (stackEnv.clients[client].start) {
      createEnvFile(clientEnvFileName(client, 'start'), stackEnv.clients[client].start, /* varPreffix */ null);
    }
    if (stackEnv.clients[client].connect) {
      createEnvFile(clientEnvFileName(client, 'connect'), stackEnv.clients[client].connect, varPreffix, (value) => {
        return value
          .replace('{hostname}', config.session.debug ? 'localhost' : clientNameNormalized);
      });
    }
  }
}

function buildLocalEnvFile(stacksConfig, serviceName) {
  buildEnvFiles();

  const file = fs.createWriteStream('.env', {flags: 'w'});
  file.write(`SERVICE=${serviceName}\n\n`);

  const service = stacksConfig.services[serviceName];
  if (service) {
    file.write(`########## service ${serviceName} variables ##########\n`);
    
    let content = fs.readFileSync(serviceEnvFileName(serviceName), 'utf8');
    file.write(content);
    file.write('\n');

    const clients = service.clients;
    if (clients) {
      for(const clientName of Object.keys(clients)) {
        // const client = clients[clientName];
        file.write(`########## client ${clientName} variables ##########\n`);
        content = fs.readFileSync(clientEnvFileName(clientName, 'connect'));
        file.write(content);
        file.write('\n');
      }    
    }
  }

  file.end();
}

function createEnvFile(fileName, envVars, varPreffix = null, cbValueTransformation = null) {
  const preffix = varPreffix ? `${varPreffix}_` : ''; 

  /*
  const file = fs.createWriteStream(fileName, {flags: 'w'});

  for(const v of Object.keys(envVars)) {
    file.write(`${preffix}${v}=${envVars[v]}\n`);
  }

  file.end();
  */

  let content = '';

  for(const v of Object.keys(envVars)) {
    const value = cbValueTransformation ? cbValueTransformation(envVars[v]) : envVars[v];
    content = content + `${preffix}${v}=${value}\n`;
  }
  fs.writeFileSync(fileName, content);
}

function serviceEnvFileName(serviceName) {
  return `${stackBuildEnvPath()}/service.${serviceName}.env`;
}

function clientEnvFileName(clientName, type /* start | connect */) {
  const clientNameNormalized = clientName.replace(config.STACK_CLIENT_NAME_SEPARATOR, '.');
  return `${stackBuildEnvPath()}/client.${clientNameNormalized}.${type}.env`
}

function updateStackEnvFile(stacksConfig) {
  // populate config.STACK_ENV with env vars default values from clients manifests
 
  let stacksEnv = {};

  if (fs.existsSync(config.STACK_ENV)) {
    try {
      const data = fs.readFileSync(config.STACK_ENV);
      stacksEnv = JSON.parse(data);
    }
    catch(error) {
      console.error(error);
      return;
    }  
  }

  if (!stacksEnv.services) stacksEnv.services = {}
  if (!stacksEnv.clients) stacksEnv.clients = {}

  if (stacksConfig.services) {
    for (const serviceName of Object.keys(stacksConfig.services)) {
      if (!stacksEnv.services[serviceName]) stacksEnv.services[serviceName] = {}
    }
  }

  if (stacksConfig.clients) {
    for (const clientName of Object.keys(stacksConfig.clients)) {
      const clientManifest = readClientManifest(clientName);
      if (clientManifest && clientManifest.docker && clientManifest.docker.env) {
        const client = stacksConfig.clients[clientName];

        if (!stacksEnv.clients[clientName]) stacksEnv.clients[clientName] = {}

        if (clientManifest.docker.env.connect) {
          if (!stacksEnv.clients[clientName].connect) stacksEnv.clients[clientName].connect = {}

          for (const envVarName of Object.keys(clientManifest.docker.env.connect)) {
            if (!stacksEnv.clients[clientName].connect[envVarName]) {
              stacksEnv.clients[clientName].connect[envVarName] = clientManifest.docker.env.connect[envVarName];
            }
          }
        }

        if (!client.external && clientManifest.docker.env.start) {
         if (!stacksEnv.clients[clientName].start) stacksEnv.clients[clientName].start = {}

          for (const envVarName of Object.keys(clientManifest.docker.env.start)) {
            if (!stacksEnv.clients[clientName].start[envVarName]) {
              stacksEnv.clients[clientName].start[envVarName] = clientManifest.docker.env.start[envVarName];
            }
          }
        }
      }
    }
  }

  fs.writeFileSync(config.STACK_ENV, JSON.stringify(stacksEnv, null, 2));
}

//===================================================================================
function clientTypeName(clientName) {
  const segments = clientName.split(config.STACK_CLIENT_NAME_SEPARATOR);
  if (segments.length > 0) {
    return segments[segments.length - 1];
  }
  else  {
    return clientName;
  }
}

function readClientManifest(clientName) {
  const clientType = clientTypeName(clientName);
  const fileName = `./core/clients/${clientType}/${config.STACK_CLIENT_MANIFEST}`;

  let res = null;

  if (fs.existsSync(fileName)) {
    const data = fs.readFileSync(fileName);
    res = JSON.parse(data);  
  }

  return res;
}

function stackBuildEnvPath() {
  return config.session.debug ? config.STACK_BUILD_ENV_DEBUG_PATH : config.STACK_BUILD_ENV_PATH;
}

function hr() {
  console.info('='.repeat(50));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// get SMF root dir name
function smfDir() {
  const scriptFilename = process.argv[1];
  const realScriptFilename = fs.realpathSync(scriptFilename);
  const realScriptDir  = path.dirname(realScriptFilename);
  const segs = realScriptDir.split(path.sep);
  segs.pop();
  return segs.join(path.sep);
}

/*
function copyFiles(src, dst = '') {
  console.info(src);

  copyfiles(
    [
      `${smfDir}/${src}`,
      `./${projectName}${dst}`,
    ],
    {
      all: true,
      up: smfDir.split(path.sep).length, // slice out upper folders
    },
    () => {
      // console.info(`${src} copied`)
    }
  );  
}
*/

function copyFilesAsync(src, dst = '', up = 0) {
  const root = smfDir();

  return new Promise((resolve, reject) => {
    console.info(src);

    copyfiles(
      [
        `${root}/${src}`,
        dst,
      ],
      {
        all: true,
        up: root.split(path.sep).length + up, // slice out upper folders
      },
      (err) => {
        // console.info(`${src} copied`);
        if (err) reject(err)
        else resolve();
      }
    );  
  });
}

//===================================================================================
module.exports = {
  buildEnvFiles,
  buildLocalEnvFile,
  serviceEnvFileName,
  clientEnvFileName,
  exec,
  updateStackEnvFile,
  readClientManifest,
  hr,
  sleep,
  smfDir,
  copyFilesAsync,
}