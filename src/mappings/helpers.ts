/* eslint-disable prefer-const */ // to satisfy AS compiler
import { BigInt, Address, log, BigDecimal } from '@graphprotocol/graph-ts';
import { PriceOracle } from '../../generated/templates/CToken/PriceOracle';
import { EthBalance } from  "../../generated/templates/CToken/EthBalance"
import { CToken } from  "../../generated/templates/CToken/CToken"
import { Utility } from '../../generated/schema';

export function calculateCTokenTotalSupply(instance: CToken): BigInt {
  const liquidity = instance.getCash();
  const totalBorrow = instance.totalBorrowsCurrent();
  const totalReserves = instance.totalReserves();
  const totalAdminFees = instance.totalAdminFees();
  const totalFuseFees = instance.totalFuseFees();
  return liquidity.plus(totalBorrow).minus(totalReserves).plus(totalAdminFees).plus(totalFuseFees);
} 
export function getETHBalance(address: Address): BigInt {
  log.warning(`getting eth balance for {}`, [address.toHexString()]);
  const instance = EthBalance.bind(Address.fromString("0xbb0eba3023a31de8deda15742b7269caf73d0ce1"));
  const _balance = instance.try_getETHBalance(address);
  if (_balance.reverted) {
    return BigInt.fromString("0");
  } else {
    return _balance.value;
  }
}


export function updateETHPrice(): void {
  
  //update DAI/ETH price from oracle 0x1887118e49e0f4a78bd71b792a49de03504a764d
  //dai ctoken 0x03b6bff9a13adcbff10facc473c6ab2036a2412b
  const oracle = PriceOracle.bind(Address.fromString("0x1887118e49e0f4a78bd71b792a49de03504a764d"));

  let util = Utility.load("0");
  if (util == null) {
      util = new Utility("0");
      util.priceOracle = Address.fromString("0x1887118e49e0f4a78bd71b792a49de03504a764d");
  }
  const _price = oracle.try_getUnderlyingPrice(Address.fromString("0x03b6bff9a13adcbff10facc473c6ab2036a2412b"));
  if (!_price.reverted) {
      util.ethPriceInDai = _price.value.div(BigInt.fromString("100000000000"));
  } else {
      util.ethPriceInDai = BigInt.fromString("0");
  }
  util.save();
}

export function removeDecimals(value: BigInt | null, decimals: number):BigInt {
  let toDivide = "1";
  for (let i = 0; i < decimals; i++) {
      toDivide = toDivide+"0";
  }
  return value.div(BigInt.fromString(toDivide));
}

export function getTotalInUSD(amountNoDecimals: BigInt, ethUSD: BigInt, underlyingEthPriceNoDecimals: BigInt):BigInt {
  return removeDecimals(amountNoDecimals.times(underlyingEthPriceNoDecimals), 36).times(ethUSD);
}


export let fixed18 = BigDecimal.fromString("1000000000000000000");
export const secondsInFourDays = BigDecimal.fromString("5760");
export let oneBD = BigDecimal.fromString("1");
function expBD(input: BigDecimal, pow: number): BigDecimal {
  let base = input;
  for (let i =0; i < (pow-1);i++) {
    base = base.times(input);
  }
  return base;
}
export function convertMantissaToAPY (mantissa: BigDecimal): BigDecimal {
  let base = mantissa
  .div(fixed18)
  .times(secondsInFourDays)
  .plus(oneBD)
log.warning("base is {}", [base.toString()]);
const appliedExponenet = expBD(base, 365);
return BigDecimal.fromString((appliedExponenet
  .minus(oneBD)
  .times(BigDecimal.fromString("100"))).toString());
 // return (((mantissa.div(BigInt.fromString("1000000000000000000"))).times(BigInt.fromString("4").times(BigInt.fromString("60")).times(BigInt.fromString("24"))).plus(BigInt.fromString("1")).pow(5).pow(72)).minus(BigInt.fromString("1"))).times(BigInt.fromString("100"));
};

export function convertMantissaToAPR(mantissa: BigDecimal): BigDecimal {
  return (mantissa.times(BigDecimal.fromString("2372500"))).div(BigDecimal.fromString("10000000000000000"));
};


