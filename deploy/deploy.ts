import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedDarkVault = await deploy("DarkVault", {
    from: deployer,
    log: true,
  });

  console.log(`DarkVault contract: `, deployedDarkVault.address);
};
export default func;
func.id = "deploy_darkVault"; // id required to prevent reexecution
func.tags = ["DarkVault"];
