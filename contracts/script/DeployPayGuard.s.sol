// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PayGuardRegistry} from "../src/PayGuardRegistry.sol";
import {PayGuardSettlement, IPayGuardRegistry} from "../src/PayGuardSettlement.sol";

/// @dev forge script script/DeployPayGuard.s.sol --rpc-url https://rpc-test.qday.info --broadcast
///      Requires PRIVATE_KEY in the environment (use a throwaway testnet key).
contract DeployPayGuard is Script {
    function run() external returns (PayGuardRegistry registry, PayGuardSettlement settlement) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry = new PayGuardRegistry();
        settlement = new PayGuardSettlement(IPayGuardRegistry(address(registry)));
        vm.stopBroadcast();

        console2.log("PayGuardRegistry   :", address(registry));
        console2.log("PayGuardSettlement :", address(settlement));
        console2.log("chainid            :", block.chainid);
    }
}
