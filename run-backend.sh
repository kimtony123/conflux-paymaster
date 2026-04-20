#!/bin/bash
cd /home/tony/conflux-paymaster/packages/backend
exec node dist/index.js > /tmp/backend.log 2>&1