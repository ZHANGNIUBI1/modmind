#!/usr/bin/env bash
# Creates the release signing keystore and a matching keystore.properties.
# The keystore IS the app identity: back up etherstudio-release.keystore and the
# passwords permanently. Losing them means the app can never be updated again.
#
# Usage: bash scripts/create-keystore.sh
set -euo pipefail

cd "$(dirname "$0")/.."

STORE="etherstudio-release.keystore"
ALIAS="etherstudio"

if [ -f "$STORE" ]; then
  echo "error: $STORE already exists; never regenerate an existing release keystore" >&2
  exit 1
fi

keytool -genkeypair -v \
  -keystore "$STORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -dname "CN=Ether Studio Remote, OU=Ether Studio, O=Ether Studio, L=Internet, ST=Internet, C=CN"

read -rsp "Keystore password: " STORE_PASS; echo
read -rsp "Key password (enter to reuse keystore password): " KEY_PASS; echo
KEY_PASS="${KEY_PASS:-$STORE_PASS}"

cat > keystore.properties <<EOF
storeFile=$STORE
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$KEY_PASS
EOF

echo
echo "keystore.properties written. Both files are git-ignored; keep offline backups."
echo "Print the SHA-256 fingerprint needed for assetlinks.json with:"
echo "  keytool -list -v -keystore $STORE -alias $ALIAS | grep SHA256:"
