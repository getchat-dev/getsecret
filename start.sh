#!/bin/bash

export APP_ENV=
export DOCKER_DEFAULT_PLATFORM=linux/amd64
export PROJECT_DIR=$PWD
export STORAGE_DIR=$PROJECT_DIR/storage/data

export WERF_ALLOWED_LOCAL_CACHE_VOLUME_USAGE=20

export WERF_LOG_DEBUG=false
export WERF_LOG_VERBOSE=false
export WERF_DEBUG=0

COMPOSE_COMMAND='docker-compose'
if ! command -v docker-compose ; then
  COMPOSE_COMMAND='docker compose'
fi

if [[ -d /data ]]; then
  export STORAGE_DIR=/data
  export ENV_FILE_PATH=/data/.env
else
  export STORAGE_DIR=$PROJECT_DIR/storage/data
  export ENV_FILE_PATH=.env
fi

! read -rd '' HELP_STRING <<"EOF"
Usage: start.sh [OPTION]... CMD

Build (if necessary) and run the application containers.

Optional arguments:
  -f <file name>                  specify file for output
  --dev                           use dev environment (local build with not commited files)
  -v VERSION, --version VERSION   use specific application images version from the remote registry
  -h, --help                      output this message
EOF

while [[ $1 == -* ]]; do
    case "$1" in
      -h|--help|-\?) echo "$HELP_STRING"; exit 0;;
      -f) if [[ $# > 1 && $2 != -* ]]; then
            output_file=$2; shift 2
          else
            echo "-f requires an argument" 1>&2
            exit 1
          fi ;;
      -v | --version )
        IMAGE_VERSION=$2; shift 2;;
      --dev) APP_ENV=dev; shift; break;;
      -*) echo "invalid option: $1" 1>&2; show_help; exit 1;;
    esac
done

. $("$HOME/bin/trdl" use werf "1.2" "ea")

if [[ -f $ENV_FILE_PATH ]]; then
  export $(grep -v '^#' .env | xargs)
fi

if [[ $APP_ENV == dev ]]; then
  werf compose up --dev --docker-compose-options="-f docker-compose.dev.yml"
else
  werf compose up --dev --docker-compose-command-options='-d' --docker-compose-options="-f docker-compose.yml"
fi