#!/bin/bash

export DOCKER_DEFAULT_PLATFORM=linux/amd64
export PROJECT_DIR=$PWD

export WERF_ALLOWED_LOCAL_CACHE_VOLUME_USAGE=20

export WERF_LOG_DEBUG=false
export WERF_LOG_VERBOSE=false
export WERF_DEBUG=0

COMPOSE_COMMAND='docker-compose'
if ! command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_COMMAND='docker compose'
fi

export ENV_FILE_PATH=.env

! read -rd '' HELP_STRING <<"EOF"
Usage: start.sh [OPTION]... [CMD] [CMD_ARG...]

Build (if necessary) and run the Burnotes container.

Optional arguments:
  --dev                           use dev environment (mount source, run vite dev)
  --build [IMAGE_NAME...]         build all images, or selected werf images, without running the container
  --down                          stop the stack (combine with --dev to target the dev compose file)
  --purge                         --down plus remove named volumes (e.g. app_node_modules)
  -v VERSION, --version VERSION   use specific image version from the remote registry
  -h, --help                      output this message

Commands:
  up [ARG...]                     run docker compose up (default); ARG values are passed to docker compose up
  build [IMAGE_NAME...]           build all images, or selected werf images, without running the container
  down [ARG...]                   stop the stack; ARG values are passed to docker compose down
  purge [ARG...]                  stop the stack and remove named volumes

Examples:
  ./start.sh up -d                run docker compose up -d through werf
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

ACTION_ARGS=()
if [[ $# -gt 0 ]]; then
  case "$1" in
    up|build|down|purge)
      ACTION=$1
      shift
      ACTION_ARGS=("$@")
      ;;
    *)
      if [[ $ACTION == build ]]; then
        ACTION_ARGS=("$@")
      else
        echo "invalid command: $1" 1>&2
        exit 1
      fi
      ;;
  esac
fi

join_command_options() {
  local quoted_args=()
  local arg

  for arg in "$@"; do
    printf -v arg "%q" "$arg"
    quoted_args+=("$arg")
  done

  local IFS=" "
  echo "${quoted_args[*]}"
}

BUILD_IMAGES=()
if [[ $ACTION == build ]]; then
  BUILD_IMAGES=("${ACTION_ARGS[@]}")
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

DOCKER_COMPOSE_OPTIONS="-f $COMPOSE_FILE"
DOCKER_COMPOSE_COMMAND_OPTIONS=$(join_command_options "${ACTION_ARGS[@]}")

case "$ACTION" in
  up)
    werf compose up --dev --docker-compose-options="$DOCKER_COMPOSE_OPTIONS" --docker-compose-command-options="$DOCKER_COMPOSE_COMMAND_OPTIONS"
    ;;
  build)
    werf compose build "${BUILD_IMAGES[@]}" --dev --docker-compose-options="$DOCKER_COMPOSE_OPTIONS"
    ;;
  down)
    werf compose down --dev --docker-compose-options="$DOCKER_COMPOSE_OPTIONS" --docker-compose-command-options="$DOCKER_COMPOSE_COMMAND_OPTIONS"
    ;;
  purge)
    DOCKER_COMPOSE_COMMAND_OPTIONS=$(join_command_options -v "${ACTION_ARGS[@]}")
    werf compose down --dev --docker-compose-options="$DOCKER_COMPOSE_OPTIONS" --docker-compose-command-options="$DOCKER_COMPOSE_COMMAND_OPTIONS"
    ;;
esac
