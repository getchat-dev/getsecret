#!/bin/bash

export DOCKER_DEFAULT_PLATFORM=linux/amd64
export PROJECT_DIR=$PWD

export WERF_ALLOWED_LOCAL_CACHE_VOLUME_USAGE=20

export WERF_LOG_DEBUG=false
export WERF_LOG_VERBOSE=false
export WERF_DEBUG=0

COMPOSE_COMMAND='docker-compose'
if ! command -v docker-compose ; then
  COMPOSE_COMMAND='docker compose'
fi

export ENV_FILE_PATH=.env

! read -rd '' HELP_STRING <<"EOF"
Usage: start.sh [OPTION]... CMD

Build (if necessary) and run the experts-miniapp container.

Optional arguments:
  --dev                           use dev environment (mount source, run vite dev)
  --build [IMAGE_NAME...]         build all images, or selected werf images, without running the container
  --down                          stop the stack (combine with --dev to target the dev compose file)
  --purge                         --down plus remove named volumes (e.g. app_node_modules)
  -v VERSION, --version VERSION   use specific image version from the remote registry
  -h, --help                      output this message

Examples:
  ./start.sh --build              build all werf images
  ./start.sh --build app          build only the "app" image from werf.yaml
EOF

ACTION=up
while [[ $1 == -* ]]; do
    case "$1" in
      -h|--help|-\?) echo "$HELP_STRING"; exit 0;;
      -v | --version )
        IMAGE_VERSION=$2; shift 2;;
      --dev) ENV=dev; shift;;
      --build) ACTION=build; shift;;
      --down) ACTION=down; shift;;
      --purge) ACTION=purge; shift;;
      -*) echo "invalid option: $1" 1>&2; exit 1;;
    esac
done

BUILD_IMAGES=()
if [[ $ACTION == build ]]; then
  BUILD_IMAGES=("$@")
fi

export IMAGE_VERSION

. $("$HOME/bin/trdl" use werf "2" "ea")

if [[ ! -f $ENV_FILE_PATH ]]; then
  echo "Error: $ENV_FILE_PATH not found. Copy .env.example to .env and fill it in." 1>&2
  exit 1
fi

export $(grep -v '^#' "$ENV_FILE_PATH" | xargs)

if [[ $ENV == dev ]]; then
  COMPOSE_FILE=docker-compose.dev.yml
else
  COMPOSE_FILE=docker-compose.yml
fi

case "$ACTION" in
  up)
    werf compose up --dev --docker-compose-options="-f $COMPOSE_FILE"
    ;;
  build)
    werf compose build "${BUILD_IMAGES[@]}" --dev --docker-compose-options="-f $COMPOSE_FILE"
    ;;
  down)
    werf compose down --dev --docker-compose-options="-f $COMPOSE_FILE"
    ;;
  purge)
    werf compose down --dev --docker-compose-options="-f $COMPOSE_FILE -v"
    ;;
esac
