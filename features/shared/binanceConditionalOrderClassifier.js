(() => {
  "use strict";

  const KINDS = Object.freeze({
    MASTER_SL:"MASTER_SL",
    PSL:"PSL",
    MASTER_TP:"MASTER_TP",
    PARTIAL_TP:"PARTIAL_TP",
    UNKNOWN:"UNKNOWN"
  });

  function toUpper(value){
    return String(value == null ? "" : value).toUpperCase();
  }
  function num(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function truthyFlag(value){
    return value === true || String(value).toLowerCase() === "true";
  }
  function triggerPriceOf(order){
    for(const key of ["stopPrice","triggerPrice","activatePrice","price"]){
      const value = num(order && order[key]);
      if(value != null && value > 0) return value;
    }
    return null;
  }
  function quantityOf(order){
    for(const key of ["origQty","quantity","qty"]){
      const value = num(order && order[key]);
      if(value != null && value > 0) return value;
    }
    return null;
  }
  function liveStatusOf(order){
    return toUpper(order && (order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : "NEW"));
  }
  function isLive(order){
    const status = liveStatusOf(order);
    return !status || status === "NEW" || status === "PENDING" || status === "ACCEPTED" || status === "PARTIALLY_FILLED" || status.includes("NEW");
  }
  function typeTextOf(order){
    return [
      order && order.type,
      order && order.origType,
      order && order.orderType,
      order && order.algoType
    ].map(toUpper).join(" ");
  }
  function kindFromOrder(order){
    const typeText = typeTextOf(order);
    if(typeText.includes("TRAILING")) return KINDS.UNKNOWN;
    const closePosition = truthyFlag(order && order.closePosition);
    const quantity = quantityOf(order);
    const hasQuantity = quantity != null && quantity > 0;
    const isStop = typeText.includes("STOP") && !typeText.includes("TAKE_PROFIT");
    const isTakeProfit = typeText.includes("TAKE_PROFIT");
    if(isStop){
      if(closePosition) return KINDS.MASTER_SL;
      if(hasQuantity) return KINDS.PSL;
      return KINDS.UNKNOWN;
    }
    if(isTakeProfit){
      if(closePosition) return KINDS.MASTER_TP;
      if(hasQuantity) return KINDS.PARTIAL_TP;
      return KINDS.UNKNOWN;
    }
    return KINDS.UNKNOWN;
  }
  function classify(order){
    const kind = kindFromOrder(order);
    return {
      kind,
      sourceOrder:order || null,
      symbol:order && order.symbol != null ? order.symbol : null,
      side:order && order.side != null ? order.side : null,
      positionSide:order && order.positionSide != null ? order.positionSide : null,
      triggerPrice:triggerPriceOf(order),
      quantity:quantityOf(order),
      closePosition:truthyFlag(order && order.closePosition),
      clientOrderId:order && order.clientOrderId != null ? order.clientOrderId : null,
      clientAlgoId:order && order.clientAlgoId != null ? order.clientAlgoId : null,
      orderId:order && order.orderId != null ? order.orderId : null,
      algoId:order && order.algoId != null ? order.algoId : null,
      ownership:order && order.owner != null ? order.owner : null,
      typeText:typeTextOf(order),
      isLive:isLive(order)
    };
  }

  window.BinanceConditionalOrderClassifier = Object.freeze({
    KINDS,
    classify,
    isLive,
    quantityOf,
    triggerPriceOf,
    truthyFlag,
    typeTextOf
  });
})();
