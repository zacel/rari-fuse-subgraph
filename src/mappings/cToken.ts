/* eslint-disable prefer-const */ // to satisfy AS compiler


import { NewFuseFee, Borrow, NewAdminFee, NewComptroller, Mint, LiquidateBorrow, AccrueInterest } from "../../generated/templates/CToken/CToken";
import { Utility, Ctoken as CtokenSchema, UnderlyingAsset as UnderlyingAssetSchema, Pool as ComptrollerSchema } from "../../generated/schema";

import { CToken } from "../../generated/templates/CToken/CToken";
import { ERC20 } from "../../generated/templates/CToken/ERC20";
import { PriceOracle } from "../../generated/templates/CToken/PriceOracle";
import { CToken as CTokenTemplate } from "../../generated/templates";
import { log, dataSource, Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts';
import { calculateCTokenTotalSupply, convertMantissaToAPR, convertMantissaToAPY, getTotalInUSD, updateETHPrice } from "./helpers";
import {
    AccessControlledAggregator
} from "../../generated/AccessControlledAggregator/AccessControlledAggregator"


export function handleNewFuseFee(event: NewFuseFee): void {
    const entity = CtokenSchema.load(event.address.toHexString());
    //entity.fuseFee = event.params.newFuseFeeMantissa;
    updateCtoken(entity, event.address);
    entity.save();
}

export function handleNewAdminFee(event: NewAdminFee): void {
    const entity = CtokenSchema.load(event.address.toHexString());
    //entity.adminFee = event.params.newAdminFeeMantissa;

    updateCtoken(entity, event.address);
    entity.save();

}

export function handleNewComptroller(event: NewComptroller): void {
    const entity = CtokenSchema.load(event.address.toHexString());
    entity.pool = event.params.newComptroller.toHexString();

    updateCtoken(entity, event.address);
    entity.save();
}

export function handleBorrow(event: Borrow): void {
    const entity = CtokenSchema.load(event.address.toHexString());
    //entity.totalBorrows = event.params.totalBorrows;

    updateCtoken(entity, event.address);
    entity.save();
}

export function handleMint(event: Mint): void {
    const entity = CtokenSchema.load(event.address.toHexString());

    updateCtoken(entity, event.address);
    entity.save();
}

export function handleLiquidateBorrow(event: LiquidateBorrow): void {
    const entity = CtokenSchema.load(event.address.toHexString());

    updateCtoken(entity, event.address);
    entity.totalSeizedTokens = entity.totalSeizedTokens.plus(event.params.seizeTokens);
    log.warning(`🚨2 update totalSeized to {}`, [event.params.seizeTokens.toString()]);
    const pool = ComptrollerSchema.load(entity.pool);
    pool.totalSeizedTokens = pool.totalSeizedTokens.plus(event.params.seizeTokens);
    pool.save();
    entity.save();
}

export function handleAccrueInterest(event: AccrueInterest): void {
    const entity = CtokenSchema.load(event.address.toHexString());

    updateCtoken(entity, event.address);
    entity.save();
}





function updateCtoken(entity: CtokenSchema | null, address: Address): void {
    log.warning("🚨Updating Ctoken  now {}", [address.toHexString()]);

    updateETHPrice();

    let util = Utility.load("0");
    const ethUSD = util.ethPriceInDai;



    //update price from oracle on pool
    const pool = ComptrollerSchema.load(entity.pool);
    const oracle = PriceOracle.bind(pool.priceOracle as Address);
    const asset = UnderlyingAssetSchema.load(entity.underlying);
    const _price = oracle.try_getUnderlyingPrice(address);
    if (!_price.reverted) {
        asset.price = _price.value;
    }
    /* 
        entity.underlyingToken = asset.address;
        entity.underlyingPrice = asset.price; */


    const instance = CToken.bind(address);
    const erc20 = ERC20.bind(Address.fromString(entity.underlying));

    entity.name = instance.name();
    entity.symbol = instance.symbol();
    entity.decimals = instance.decimals();
    const _balance = erc20.try_balanceOf(address);
    if (!_balance.reverted) {
        entity.underlyingBalance = _balance.value;
    }

    const totalSupply = calculateCTokenTotalSupply(instance);
    //this one is seperate from the other if block because usd increase doesn't always mean that real amount increased
    if (entity.totalSupply.ge(_price.value)) {
        asset.totalSupply = asset.totalSupply.plus(totalSupply.minus(entity.totalSupply));
    } else {
        asset.totalSupply = asset.totalSupply.minus(entity.totalSupply.minus(totalSupply));
    }

    entity.totalSupply = totalSupply;
    const newTotalSupplyUSD = getTotalInUSD(totalSupply, ethUSD, asset.price);
    if (entity.liquidityUSD.ge(newTotalSupplyUSD)) {
        //total increased
        pool.totalSupplyUSD = pool.totalSupplyUSD.plus(newTotalSupplyUSD.minus(entity.totalSupplyUSD));
        asset.totalSupplyUSD = asset.totalSupplyUSD.plus(newTotalSupplyUSD.minus(entity.totalSupplyUSD));
    } else {
        //total decreased
        pool.totalSupplyUSD = pool.totalSupplyUSD.minus(entity.totalSupplyUSD.minus(newTotalSupplyUSD));
        asset.totalSupplyUSD = asset.totalSupplyUSD.minus(entity.totalSupplyUSD.minus(newTotalSupplyUSD));
    }
    entity.totalSupplyUSD = newTotalSupplyUSD;

    const _cash = instance.try_getCash();
    if (!_cash.reverted) {

        //this one is seperate from the other if block because usd increase doesn't always mean that real amount increased
        if (entity.liquidity.ge(_price.value)) {
            asset.totalLiquidity = asset.totalLiquidity.plus(_cash.value.minus(entity.liquidity));
        } else {
            asset.totalLiquidity = asset.totalLiquidity.minus(entity.liquidity.minus(_cash.value));
        }


        entity.liquidity = _cash.value;

        const newLiquidityUSD = getTotalInUSD(_cash.value, ethUSD, asset.price);
        if (entity.liquidityUSD.ge(newLiquidityUSD)) {
            //total increased
            pool.totalLiquidityUSD = pool.totalLiquidityUSD.plus(newLiquidityUSD.minus(entity.liquidityUSD));
            asset.totalLiquidityUSD = asset.totalLiquidityUSD.plus(newLiquidityUSD.minus(entity.liquidityUSD));
        } else {
            //total decreased
            pool.totalLiquidityUSD = pool.totalLiquidityUSD.minus(entity.liquidityUSD.minus(newLiquidityUSD));
            asset.totalLiquidityUSD = asset.totalLiquidityUSD.minus(entity.liquidityUSD.minus(newLiquidityUSD));
        }
        entity.liquidityUSD = newLiquidityUSD;
    }

    const _borrowRatePerBlock = instance.try_borrowRatePerBlock();
    if (!_borrowRatePerBlock.reverted) {
        entity.borrowRatePerBlock = _borrowRatePerBlock.value;
        entity.borrowAPR = convertMantissaToAPR(BigDecimal.fromString(_borrowRatePerBlock.value.toString()));
    }

    const _totalBorrow = instance.try_totalBorrowsCurrent();
    if (!_totalBorrow.reverted) {
          //this one is seperate from the other if block because usd increase doesn't always mean that real amount increased
      if (entity.totalBorrow.ge(_price.value)) {
        asset.totalBorrow = asset.totalBorrow.plus(_totalBorrow.value.minus(entity.totalBorrow));
    } else {
        asset.totalBorrow = asset.totalBorrow.minus(entity.totalBorrow.minus(_totalBorrow.value));
    }

    entity.totalBorrow = _totalBorrow.value;

        const newBorrowUSD = getTotalInUSD(_totalBorrow.value, ethUSD, asset.price);
        if (entity.liquidityUSD.ge(newBorrowUSD)) {
            //total increased
            asset.totalBorrowUSD = asset.totalBorrowUSD.plus(newBorrowUSD.minus(entity.totalBorrowUSD));
            pool.totalBorrowUSD = pool.totalBorrowUSD.plus(newBorrowUSD.minus(entity.totalBorrowUSD));
        } else {
            //total decreased
            pool.totalBorrowUSD = pool.totalBorrowUSD.minus(entity.totalBorrowUSD.minus(newBorrowUSD));
            asset.totalBorrowUSD = asset.totalBorrowUSD.minus(entity.totalBorrowUSD.minus(newBorrowUSD));
        }
        entity.totalBorrowUSD = newBorrowUSD;
    }



    const _totalReserves = instance.try_totalReserves();
    if (!_totalReserves.reverted) {
        entity.totalReserves = _totalReserves.value;
    }

    const _reserveFactor = instance.try_reserveFactorMantissa();
    if (!_reserveFactor.reverted) {
        entity.reserveFactor = _reserveFactor.value;
    }

    const _adminFee = instance.try_adminFeeMantissa();
    if (!_adminFee.reverted) {
        entity.adminFee = _adminFee.value;
    }

    const _fuseFee = instance.try_fuseFeeMantissa();
    if (!_fuseFee.reverted) {
        entity.fuseFee = _fuseFee.value;
    }

    const _totalAdminFees = instance.try_totalAdminFees();
    if (!_totalAdminFees.reverted) {
        entity.totalAdminFees = _totalAdminFees.value;
    }

    const _supplyRatePerBlock = instance.try_supplyRatePerBlock();
     if (!_supplyRatePerBlock.reverted) { 
        entity.supplyRatePerBlock = _supplyRatePerBlock.value;
        log.warning("🚨 updating supplyAPY to {} from {}", [convertMantissaToAPY(BigDecimal.fromString(_supplyRatePerBlock.value.toString())).toString(), _supplyRatePerBlock.value.toString()]);
        entity.supplyAPY = convertMantissaToAPY(BigDecimal.fromString(_supplyRatePerBlock.value.toString()));
     }

    entity.save();
    pool.save();
    asset.save();
}