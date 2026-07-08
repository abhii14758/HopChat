#!/usr/bin/env node
'use strict';

require('../cli')
  .run(process.argv.slice(2))
  .catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
