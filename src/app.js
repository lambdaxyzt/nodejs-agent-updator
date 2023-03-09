import * as dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
const myEnv = dotenv.config()
dotenvExpand.expand(myEnv)
import { Env } from "@humanwhocodes/env";
const env = new Env();
import fs from "fs/promises"
import fss from "fs"
import fsExtra from "fs-extra"
import fetch from "node-fetch"
import pm2 from "./pm2/pm2-promise.js"
import {isProcessStarted, ListOfProcess} from "./pm2/pm2-util.js";
import cron from "node-cron";
import logger from "./logging/index.js";

const {
    DOMAIN,
    AGENT_TOKEN,
    AGENT_URL,
    AGENT_DIRECTORY,
    AGENT_HASH_URL,
    AGENT_ENV_URL,
    AGENT_ENV_HASH_URL,
    AGENT_PROCESS_NAME,
} = env.required;

const AGENT_PATH = AGENT_DIRECTORY + "/agent.js"
const AGENT_ENV_PATH = AGENT_DIRECTORY + "/agent.json"
const AGENT_PATH_HASH = AGENT_DIRECTORY + "/agent.js.hash"
const AGENT_PATH_ENVHASH = AGENT_DIRECTORY + "/agent.env.hash"

const fetchOption = {
    method: 'post',
    body: JSON.stringify({token:AGENT_TOKEN}),
    headers: {'Content-Type': 'application/json'}
}

async function getAgentHash() {
    return fetch(AGENT_HASH_URL,fetchOption)
        .then((response)=>{
            return response.json()
        })
        .then(body => {
            if(body.success){
                logger.info('successfully get agent hash');
                return body.data.hash
            }
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message + " : error getting hash");
            process.exit(2)
        })
}

async function getAgentEnvHash() {
    console.log(AGENT_ENV_HASH_URL)
    return fetch(AGENT_ENV_HASH_URL,fetchOption)
        .then((response)=>{
            return response.json()
        })
        .then(body => {
            if(body.success){
                logger.info('successfully get environment hash');
                logger.debug('successfully get environment hash (getAgentEnvHash)');
                return body.data.env.hash
            }
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message + " : error getting env hash");
        })
}


async function getAgent() {
    return await fetch(AGENT_URL,fetchOption)
        .then((response)=>{
            return response.json()
        }).then(body => {
            if(body.success){
                logger.info('successfully get agent');
                return body.data.file
            }
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message  + " : error getting agent ");
        })
}

async function getAgentEnv() {
    return await fetch(AGENT_ENV_URL,fetchOption)
        .then((response)=>{
            return response.json()
        })
        .then(body => {
            if(body.success){
                logger.info('successfully get agent environment variable');
                return body.data.env
            }
            throw new Error(body.message)
        })
        .catch(function (error) {
            logger.error(error.message  + " : error getting agent env ");
        })
}

async function updateAgent() {
    //get hash
    const hash = await getAgentHash() || "nohashfound"
    const env_hash = await getAgentEnvHash() || "nohashfound"

     // check if env file exist
    if (!fss.existsSync(AGENT_PATH_ENVHASH)) {
        await fs.writeFile(AGENT_PATH_ENVHASH,env_hash,{ flag: 'w+' ,encoding:"utf-8"})
        logger.info(`file : ${AGENT_PATH_ENVHASH}  did not exist ! created one`);
    }
    // check if hash file exist
    if (!fss.existsSync(AGENT_PATH_HASH)) {
        await fs.writeFile(AGENT_PATH_HASH,hash,{ flag: 'w+' ,encoding:"utf-8"})
        logger.info(`file : ${AGENT_PATH_HASH}  did not exist ! created one`);
    }

    const prevHash = await fs.readFile(AGENT_PATH_HASH,"utf-8")
    const prevEnvHash = await fs.readFile(AGENT_PATH_ENVHASH,"utf-8")
    logger.debug(`hash : ${hash} ==? ${prevHash} : prevHash `)
    logger.debug(`env_hash : ${env_hash} ==? ${prevEnvHash} : prevEnvHash `)
    if ((hash !== prevHash) || (env_hash !== prevEnvHash)) {
        logger.debug(`some hash was different start updating file`)
        const file_content = await getAgent()
        const env_content =  await getAgentEnv() || {}
        await fs.writeFile(AGENT_PATH,file_content,"utf-8")
        logger.info(`successfully writing agent`);
        await fs.writeFile(AGENT_ENV_PATH,JSON.stringify(env_content),"utf-8");
        logger.info(`successfully writing agent env`);
        await fs.writeFile(AGENT_PATH_HASH,hash,"utf-8")
        logger.info(`successfully writing agent env hash`);
        await fs.writeFile(AGENT_PATH_ENVHASH,env_hash,"utf-8")
        logger.info(`successfully writing agent hash`);
        return true
    }
    return false
}

let n = 0;
const fullProcess = async ()=>{
    try {
        await pm2.connect()
        if (!fss.existsSync(AGENT_ENV_PATH)) {
            await fsExtra.outputFile(AGENT_ENV_PATH,JSON.stringify({}),"utf-8")
        }
        const env_file = JSON.parse(
            fss.readFileSync(AGENT_ENV_PATH,"utf-8")
        )

        const agentUpdated = await updateAgent()
        logger.info(`agent need update ? ${agentUpdated}`);
        if(agentUpdated) {
            logger.info(`agent updated !!! so go from pm2`);
            if(! await isProcessStarted(AGENT_PROCESS_NAME)){
                await pm2.start({
                    script    : AGENT_PATH,
                    name      : AGENT_PROCESS_NAME,
                    env       : env_file,
                })
                logger.info(`script did not start before , it now started`);
            } else {
                await pm2.delete(AGENT_PROCESS_NAME)
                await pm2.start({
                    script    : AGENT_PATH,
                    name      : AGENT_PROCESS_NAME,
                    env       : env_file,
                })
                logger.info(`script restarted in pm2 watch agent !`);
            }
        }
    }catch (error) {
        console.log(error)
    } finally {
        await pm2.disconnect()
    }
}

await fullProcess()
cron.schedule("*/20 * * * * *",async ()=>{
    await fullProcess()
})
