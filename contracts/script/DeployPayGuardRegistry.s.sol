// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {PayGuardRegistry} from "../src/PayGuardRegistry.sol";

contract DeployPayGuardRegistry is Script {
    function run() external returns (PayGuardRegistry registry) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry = new PayGuardRegistry();
        vm.stopBroadcast();
    }
}
