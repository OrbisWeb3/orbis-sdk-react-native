global.Buffer = global.Buffer || require('buffer').Buffer
import 'react-app-polyfill/ie11';
import 'core-js/features/array/find';
import 'core-js/features/array/includes';
import 'core-js/features/number/is-nan';
import 'react-native-url-polyfill/auto';
import * as encoding from 'text-encoding';
const base64Decode = require('fast-base64-decode')
const { NativeModules } = require('react-native')
import RNFetchBlob from 'react-native-fetch-blob'

const Blob = RNFetchBlob.polyfill.Blob

/*if (typeof global.crypto !== 'object') {
  console.log("global.crypto doesn't exist, we initialize it.");
  global.crypto = {}
}


/** Assign crypto
global.crypto = crypto;
console.log("global.crypto: ", global.crypto);*/

/** Polyfill to fix allSettled */
Promise.allSettled = function (promises) {
  let mappedPromises = promises.map((p) => {
    return p
      .then((value) => {
        return {
          status: 'fulfilled',
          value,
        };
      })
      .catch((reason) => {
        return {
          status: 'rejected',
          reason,
        };
      });
    });
  return Promise.all(mappedPromises);
};

/** Polyfill to fix crypto package */

class TypeMismatchError extends Error {}
class QuotaExceededError extends Error {}

let warned = false
function insecureRandomValues (array) {
  if (!warned) {
    console.warn('Using an insecure random number generator, this should only happen when running in a debugger without support for crypto.getRandomValues')
    warned = true
  }

  for (let i = 0, r; i < array.length; i++) {
    if ((i & 0x03) === 0) r = Math.random() * 0x100000000
    array[i] = (r >>> ((i & 0x03) << 3)) & 0xff
  }

  return array
}

/**
 * @param {number} byteLength
 * @returns {string}
 */
function getRandomBase64 (byteLength) {
  if (NativeModules.RNGetRandomValues) {
    return NativeModules.RNGetRandomValues.getRandomBase64(byteLength)
  } else if (NativeModules.ExpoRandom) {
    // Expo SDK 41-44
    return NativeModules.ExpoRandom.getRandomBase64String(byteLength)
  } else if (global.ExpoModules) {
    // Expo SDK 45+
    return global.ExpoModules.ExpoRandom.getRandomBase64String(byteLength);
  } else {
    throw new Error('Native module not found')
  }
}

/**
 * Polyfill to replace the crypto.getRandomValues function
 * @param {Int8Array|Uint8Array|Int16Array|Uint16Array|Int32Array|Uint32Array|Uint8ClampedArray} array
 */
function _getRandomValues (array) {
  if (!(array instanceof Int8Array || array instanceof Uint8Array || array instanceof Int16Array || array instanceof Uint16Array || array instanceof Int32Array || array instanceof Uint32Array || array instanceof Uint8ClampedArray)) {
    throw new TypeMismatchError('Expected an integer array')
  }

  if (array.byteLength > 65536) {
    throw new QuotaExceededError('Can only request a maximum of 65536 bytes')
  }

  // Calling getRandomBase64 in debug mode leads to the error
  // "Calling synchronous methods on native modules is not supported in Chrome".
  // So in that specific case we fall back to just using Math.random.
  if (__DEV__) {
    if (typeof global.nativeCallSyncHook === 'undefined') {
      return insecureRandomValues(array)
    }
  }

  base64Decode(getRandomBase64(array.byteLength), new Uint8Array(array.buffer, array.byteOffset, array.byteLength))

  return array
}

/** Polyfill to replace the crypto.subtle.digest function */
async function _digest(algo, data) {
  console.log("Enter _digest with:");
  console.log("algo:", algo);
  console.log("data:", data);
  let hash = sha256.create().update(data).digest();
  console.log("Returning " + hash + " from _digest.");
  return hash
}



async function digestCrypto(algo, data) {
  console.log("Enter digestCrypto with:");
  console.log("algo:", algo);
  console.log("data:", data);
  let res_hash;
  global.crypto.subtle.digest({ name: 'SHA-256' }, data).then(hash => {
    console.log("hash: ", hash);
    res_hash = hash;
    console.log("Returning " + res_hash + " from digestCrypto.");
    return res_hash;
  });

}

/** Polyfill to replace the crypto.subtle.generateKey function */
async function _cryptoGenerateKey(algorithm, extractable, keyUsages) {
  console.log("Entering _cryptoGenerateKey via crypto.subtle.generateKey with:");
  console.log("algorithm:", algorithm);
  console.log("extractable:", extractable);
  console.log("keyUsages:", keyUsages);

  let key_res;
  global.crypto.subtle.generateKey(algorithm,
    extractable, //whether the key is extractable (i.e. can be used in exportKey)
    keyUsages //can be any combination of "sign" and "verify"
  ).then(function(key){
    console.log("crypto.subtle.generateKey / key: ", key)
    key_res = key;
    console.log("_cryptoGenerateKey about to return:", key_res);
    return key_res;
  }).catch(function(err){
    console.log("Error crypto.subtle.generateKey: ", err);
    key_res = err;
    return err;
  });
}

/** Replace default function
global.crypto.getRandomValues = _getRandomValues;
global.crypto.subtle.digest = digestCrypto;*/
//global.crypto.subtle.generateKey = _cryptoGenerateKey;
