import LitJsSdk from 'lit-js-sdk-no-wasm'
import { toUtf8Bytes } from "@ethersproject/strings";
import { hexlify } from "@ethersproject/bytes";
import { blobToBase64, decodeb64, buf2hex, getAddressFromDid, sleep } from "./index.js";
//import msrcrypto from "msrcrypto";

/** Replaces localStorage in React Native */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Initialize lit */
let lit;
let litReady = false;
export async function connectLit() {
  let ready;
  lit = new LitJsSdk.LitNodeClient({alertWhenUnauthorized: false, debug: false})
  await lit.connect();
  console.log("Lit is ready now!");
  litReady = true;
}

/** temporary function to wait for Lit to be ready before decrypting conten */
async function litIsReady() {
  let ready;
  console.log("Checking if Lit is ready...: " + litReady);

  if(litReady == false) {
    await sleep(1500);
    ready = true;
  } else {
    ready = true;
  }
  console.log("Lit is ready!: " + litReady);

  return;
}

/** Requires user to sign a message which will generate the lit-signature */
export async function generateLitSignature(provider, account) {
  let signedMessage;

  /** Initiate the signature data */
  const now = new Date().toISOString();
  const AUTH_SIGNATURE_BODY = "I am creating an account to use the private features of Orbis at {{timestamp}}";
  const body = AUTH_SIGNATURE_BODY.replace("{{timestamp}}", now);
  const bodyBytes = toUtf8Bytes(body);

  /** Proceed to signing the message */
  try {
    signedMessage = await provider.send('personal_sign', [ hexlify(bodyBytes), account ]);

    /** Save signature for authentication */
    let sig = JSON.stringify({
        sig: signedMessage.result,
        derivedVia: "web3.eth.personal.sign",
        signedMessage: body,
        address: account,
    });
    await AsyncStorage.setItem("lit-auth-signature-" + account, sig);
    await AsyncStorage.setItem("lit-auth-signature", sig);

    return {
      status: 200,
      result: "Created lit signature with success."
    }
  } catch (e) {
    console.log("Error generating signature for Lit: ", e);
    return {
      status: 300,
      result: "Error generating signature for Lit.",
      error: e
    };
  }
}

/** Retrieve user's authsig from localStorage */
async function getAuthSig() {
  let authSig;
  let _storedSig = await AsyncStorage.getItem("lit-auth-signature");
  authSig = JSON.parse(_storedSig);
  if(authSig && authSig != "") {
    return authSig;
  } else {
    console.log("User not authenticated to Lit Protocol for messages")
    throw new Error("User not authenticated to Lit Protocol for messages");
  }
}

/** Decrypt a string using Lit based on a set of inputs. */
export async function decryptString(encryptedContent) {
  console.log("SDK: Enter decryptString.")
  /** Make sure Lit is ready before trying to decrypt the string */
  /*await litIsReady();
  console.log("SDK / decryptString: Lit is Ready.")*/

  /** Retrieve AuthSig */
  let authSig = await getAuthSig();

  /** Decode string encoded as b64 to be supported by Ceramic */
  let decodedString;
  console.log("before decodeb64: ", encryptedContent.encryptedString);
  try {
    decodedString = decodeb64(encryptedContent.encryptedString);
    console.log("decodedString: ", decodedString);
  } catch(e) {
    console.log("Error decoding b64 string: ", e);
    throw new Error(e);
  }

  let _access;
  try {
    _access = JSON.parse(encryptedContent.accessControlConditions);
  } catch(e) {
    console.log("Couldn't parse accessControlConditions: ", e);
    throw new Error(e);
  }


  /** Get encryption key from Lit */
  let decryptedSymmKey;
  try {
    decryptedSymmKey = await lit.getEncryptionKey({
        accessControlConditions: _access,
        toDecrypt: encryptedContent.encryptedSymmetricKey,
        chain: 'ethereum',
        authSig
    });
    console.log("decryptedSymmKey: ", decryptedSymmKey);
  } catch(e) {
    console.log("Error getting encryptionKey: ", e);
    throw new Error(e);
  }

  /** Finally decrypt the string using the workarounf function for React Native */
  let result;
  try {
    result = await litDecryptString(
      decodedString,
      decryptedSymmKey
    );
    console.log("result:", result);
  } catch(e) {
    console.log("Error decrypting string using lit workaround: ", e);
  }

  return result;
}

/** Debug only: Encrypt string from API */
async function encryptStringFromAPI(accessControlConditions, body) {
  console.log("Enter encrypStringFromAPI with ", body);
  /** Retrieve AuthSig */
  let authSig = await getAuthSig();

  /** Making sure authsig is present  */
  if(!authSig) {
    return {
      status: 300,
      result: "Error encrypting string.",
      error: "AuthSig must be present."
    }
  }

  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authSig: JSON.stringify(authSig),
      accessControlConditions: accessControlConditions,
      body: body
    })
  };
  try {
    let _data = await fetch("https://orbis-api-lit.herokuapp.com/lit-encrypt", requestOptions);
    console.log("data retrieved from API: ", _data);
    let _result = await _data.json();
    console.log("_result retrieved from API: ", _result);
    return _result.result;
  } catch(e) {
    console.log("Error encrypting string with API: ", e)
    return {
      status: 300,
      result: e
    };
  }
}

/** Debug only: Decrypt string from API */
export async function decryptStringFromAPI(encryptedContent) {
  /** Retrieve AuthSig */
  let authSig = await getAuthSig();

  /** Making sure authsig is present  */
  if(!authSig) {
    return {
      status: 300,
      result: "Error decrypting string.",
      error: "AuthSig must be present."
    }
  }

  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authSig: JSON.stringify(authSig),
      encryptedContent: encryptedContent
    })
  };
  try {
    let _data = await fetch("https://orbis-api-lit.herokuapp.com/lit-decrypt", requestOptions);
    let _result = await _data.json();
    return _result;
  } catch(e) {
    console.log("Error decrypting string with API: ", e)
    return {
      status: 300,
      result: e
    };
  }
}

function base64toBlob(b64Data) {
  console.log("base64toBlob() / b64Data:", b64Data);
  let _blob = new Blob([b64Data], {type: ""});
  console.log("base64toBlob() / _blob: ", _blob);
  return _blob
}

/** Encryp a DM */
export async function encryptDM(recipients, body, api = false) {
  /** Step 1: Retrieve access control conditions from recipients */
  let accessControlConditions = generateAccessControlConditionsForDMs(recipients);

  /** Step 2: Encrypt string and return result */
  try {
    let result;
    if(api) {
      result = await encryptStringFromAPI(accessControlConditions, body)
    } else {
      result = await encryptString(accessControlConditions, body);
    }
    console.log("result encryptDM:", result);
    return result
  } catch(e) {
    console.log("Error encrypting DM: ", e);
    throw new Error(e)
  }
}

/** Encrypt post based on the encryptionRules added by the user */
export async function encryptPost(encryptionRules, body) {
  /** Step 1: Retrieve access control conditions from recipients */
  let accessControlConditions = generateAccessControlConditionsForPosts(encryptionRules);

  /** Step 2: Encrypt string and return result */
  try {
    let result = await encrypString(accessControlConditions, body);
    return result
  } catch(e) {
    console.log("Error encrypting post: ", e);
    throw new Error(e)
  }
}

/** Encrypt string based on some access control conditions */
export async function encryptString(accessControlConditions, body) {
  /** Step 1: Retrieve AuthSig */
  let authSig = await getAuthSig();

  /** Step 2: Encrypt message */
  const { encryptedString, symmetricKey } = await litEncryptString(body);
  console.log("encryptedString: ", encryptedString);
  console.log("symmetricKey: ", symmetricKey);


  /** We convert the encrypted string to base64 to make it work with Ceramic */
  //let base64EncryptedString = await blobToBase64(encryptedString);

  let base64EncryptedString;
  try {
    base64EncryptedString = Buffer.from(encryptedString).toString('base64');
    console.log("base64EncryptedString: ", base64EncryptedString);
  } catch(e) {
    console.log("Error base64EncryptedString: ", e);
  }

  /** Step 4: Save encrypted content to lit nodes */
  let encryptedSymmetricKey;
  try {
    encryptedSymmetricKey = await lit.saveEncryptionKey({
      accessControlConditions: accessControlConditions,
      symmetricKey: symmetricKey,
      authSig: authSig,
      chain: 'ethereum'
    });
  } catch(e) {
    console.log("Error encrypting string with Lit: ", e);
    throw new Error("Error encrypting string with Lit: " + e)
  }

  /** Step 5: Return encrypted content which will be stored on Ceramic (and needed to decrypt the content) */
  return {
    accessControlConditions: JSON.stringify(accessControlConditions),
    encryptedSymmetricKey: buf2hex(encryptedSymmetricKey),
    encryptedString: base64EncryptedString
  }
}
/** Workaround to decrypt a string with Lit on React Native
const litDecryptString = async (encryptedString, symmetricKey) => {
  const importedSymmKey = await msrcrypto.subtle.importKey(
    "raw",
    symmetricKey,
    { name: "AES-CBC", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const recoveredIv = encryptedString.slice(0, 16);

  const encryptedZipArrayBuffer = encryptedString.slice(16);

  let decryptedString = await msrcrypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv: recoveredIv,
    },
    importedSymmKey,
    encryptedZipArrayBuffer
  );

  decryptedString = LitJsSdk.uint8arrayToString(
    new Uint8Array(decryptedString),
    "utf8"
  );
  return {
    status: 200,
    result: decryptedString
  };
};
*/
/** Workaround to encrypt a string with Lit on React Native
const litEncryptString = async (str) => {
  const encodedString = LitJsSdk.uint8arrayFromString(str, "utf8");

  const symmKey = await msrcrypto.subtle.generateKey(
    { name: "AES-CBC", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // encrypt the zip with symmetric key
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const encryptedZipData = await msrcrypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv,
    },
    symmKey,
    encodedString
  );
  const encryptedString = [
    ...Array.from(iv),
    ...Array.from(new Uint8Array(encryptedZipData)),
  ];

  const exportedSymmKey = new Uint8Array(
    await msrcrypto.subtle.exportKey("raw", symmKey)
  );

  return {
    encryptedString,
    symmetricKey: exportedSymmKey,
  };
};
*/

/** This function will take an array of recipients and turn it into a clean access control conditions array */
export function generateAccessControlConditionsForDMs(recipients) {
  let _accessControlConditions = [];

  /** Loop through each recipient */
  recipients.forEach((recipient, i) => {
    /** Get ETH address from DiD */
    let { address, network } = getAddressFromDid(recipient);

    if(network == "eip155") {
      /** Push access control condition to array */
      _accessControlConditions.push({
        contractAddress: '',
        standardContractType: '',
        chain: 'ethereum',
        method: '',
        parameters: [
          ':userAddress',
        ],
        returnValueTest: {
          comparator: '=',
          value: address
        }
      })

      /** Push `or` operator if recipient isn't the last one of the list */
      if(i < recipients.length -1) {
        _accessControlConditions.push({"operator": "or"})
      }
    } else {
      /** For now ignore non-ethereum chains as they are not supported on Orbis */
    }


  });

  /** Return clean access control conditions */
  return _accessControlConditions;
}

/** This function will take the encryptionRules object and turn it into a clean access control conditions array */
export function generateAccessControlConditionsForPosts(encryptionRules) {
  let _accessControlConditions = [];

  switch(encryptionRules.type) {
    case "token-gated":
      let chain = encryptionRules.chain;
      let contractType = encryptionRules.contractType; // Can be only ERC20 or ERC721
      let contractAddress = encryptionRules.contractAddress;
      let minTokenBalance = encryptionRules.minTokenBalance;

      if(encryptionRules.contractType == "ERC20" || encryptionRules.contractType == "ERC721") {
        /** Adds an access control condition based on token gated content */
        _accessControlConditions.push({
          contractAddress: encryptionRules.contractAddress,
          standardContractType: encryptionRules.contractType,
          chain: encryptionRules.chain,
          method: 'balanceOf',
          parameters: [
            ':userAddress'
          ],
          returnValueTest: {
            comparator: '>=',
            value: encryptionRules.minTokenBalance
          }
        });
      } else if(encryptionRules.contractType == "ERC1155") {
        _accessControlConditions.push({
          contractAddress: encryptionRules.contractAddress,
          standardContractType: encryptionRules.contractType,
          chain: encryptionRules.chain,
          method: 'balanceOf',
          parameters: [
            ':userAddress',
            encryptionRules.tokenId
          ],
          returnValueTest: {
            comparator: '>=',
            value: encryptionRules.minTokenBalance
          }
        });
      }

      break;
  }

  /** Return clean access control conditions */
  return _accessControlConditions;
}
