import React from "react";
import Image from "next/legacy/image";
import Round from "@/public/assets/Round.svg";
import Twitter from "@/public/assets/Twitter.svg";
import Telegram from "@/public/assets/Telegram.svg";
import ConnectWallet from "./ConnectWallet";
import { Box, HStack } from "@chakra-ui/react";

function Header() {
  return (
    <Box display={"flex"} flexDirection={"row"} w={"full"} alignItems={"center"} justifyContent={"end"} pt={"2rem"} bg={"transparent"}>
      <HStack gap={5}>
        <span className="mx-1">
          <Image src={Round} alt="" width={25} height={25} />
        </span>
        <span className="mx-1">
          <Image src={Twitter} alt="" width={25} height={25} />
        </span>
        <span className="mx-1">
          <Image src={Telegram} alt="" width={25} height={25} />
        </span>
      </HStack>
      <Box ml={12} mr={62}>
        <ConnectWallet />
      </Box>
    </Box>
  );
}

export default Header;
