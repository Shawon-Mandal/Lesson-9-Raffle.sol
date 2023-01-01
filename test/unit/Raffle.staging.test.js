const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const {
    ContractFunctionVisibility,
} = require("hardhat/internal/hardhat-network/stack-traces/model")
const { resolveConfig } = require("prettier")

const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

/* ternary operator:
condition? if the condition is true,this will occur:if the condition is false,this will occur */

developmentChains.includes(network.name) //if we are on a development chain
    ? describe.skip //we will skip describe as it was only meant for local chain
    : describe("Raffle Unit Tests", function () {
          let raffle, raffleEntranceFee, deployer //the things we need to deploy

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer) //we are going to get the raffle connect it with the deployer
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF,we get a random winner", async function () {
                  // enter the raffle
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      //this is a listener
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          //we are making sure that a winner can be picked to make sure everything is working fine before entering the raffle

                          try {
                              //add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts(0).address)
                              assert.equal(raffleState, 0) //because,we want our enum to be reset
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee.toString())
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(e)
                          }
                      })
                      //then we are going to enter the rafflee
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
