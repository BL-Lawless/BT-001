(() => {
  "use strict";

  const ACTIVE = new Set(["NEW","PARTIALLY_FILLED"]);
  const CANCELED = new Set(["CANCELED","CANCELLED","EXPIRED","REJECTED"]);

  function number(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function upper(value){ return String(value == null ? "" : value).toUpperCase(); }
  function normalizeOrder(order){
    if(!order) return null;
    return Object.assign({},order,{
      symbol:order.symbol != null ? order.symbol : order.s,
      orderId:order.orderId != null ? order.orderId : order.i,
      clientOrderId:order.clientOrderId != null ? order.clientOrderId : order.c,
      status:order.status != null ? order.status : order.orderStatus != null ? order.orderStatus : order.X,
      price:order.price != null ? order.price : order.p,
      executedQty:order.executedQty != null ? order.executedQty : order.z
    });
  }
  function identity(order){
    const value = normalizeOrder(order);
    if(!value) return null;
    return {
      symbol:String(value.symbol || ""),
      orderId:value.orderId != null ? value.orderId : null,
      clientOrderId:String(value.clientOrderId || value.origClientOrderId || "")
    };
  }
  function sameIdentity(left,right){
    const a = identity(left);
    const b = identity(right);
    if(!a || !b) return false;
    if(a.symbol && b.symbol && upper(a.symbol) !== upper(b.symbol)) return false;
    if(a.orderId != null && b.orderId != null) return String(a.orderId) === String(b.orderId);
    return !!(a.clientOrderId && b.clientOrderId && a.clientOrderId === b.clientOrderId);
  }

  function create(options){
    const opts = options || {};
    const pollMs = Math.max(100,number(opts.pollMs) || 1000);
    let timer = null;
    let busy = false;
    let run = null;

    function snapshot(extra){
      if(!run) return Object.freeze({active:false});
      const filledQty = Math.min(run.requestedQty,run.carriedFilled + run.currentExecuted);
      return Object.freeze(Object.assign({
        active:true,
        canceling:run.canceling,
        label:run.label,
        requestedQty:run.requestedQty,
        filledQty,
        remainingQty:Math.max(0,run.requestedQty - filledQty),
        price:run.price,
        orderId:run.orderId,
        clientOrderId:run.clientOrderId,
        startedAt:run.startedAt,
        expiresAt:run.expiresAt,
        meta:run.meta
      },extra || {}));
    }
    function update(message,tone="normal",extra){
      const state = snapshot(Object.assign({message:String(message || ""),tone},extra || {}));
      if(typeof opts.onUpdate === "function") opts.onUpdate(state);
      return state;
    }
    function clearTimer(){
      if(timer != null) (opts.clearTimeout || clearTimeout)(timer);
      timer = null;
    }
    function schedule(){
      clearTimer();
      if(!run || run.canceling) return;
      timer = (opts.setTimeout || setTimeout)(() => { void tick(); },pollMs);
    }
    function bookState(){
      return typeof opts.getTopOfBook === "function" ? opts.getTopOfBook() : null;
    }
    function usableBook(value){
      const valid = value && value.fresh === true && number(value.bid) > 0 && number(value.ask) > 0;
      return valid ? value : null;
    }
    function book(){ return usableBook(bookState()); }
    function applyOrder(order){
      if(!run || !order) return;
      const normalized = normalizeOrder(order);
      const nextIdentity = identity(normalized);
      if(nextIdentity){
        run.orderId = nextIdentity.orderId;
        run.clientOrderId = nextIdentity.clientOrderId;
      }
      const executed = Math.max(0,number(normalized.executedQty) || 0);
      run.currentExecuted = Math.max(run.currentExecuted,executed);
      if(number(normalized.price) > 0) run.price = String(normalized.price);
    }
    function carryCurrentFill(){
      if(!run) return;
      run.carriedFilled = Math.min(run.requestedQty,run.carriedFilled + run.currentExecuted);
      run.currentExecuted = 0;
      run.orderId = null;
      run.clientOrderId = "";
      run.price = "";
    }
    function desiredPrice(top){
      const value = typeof opts.priceFor === "function" ? opts.priceFor(top,snapshot()) : "";
      return number(value) > 0 ? String(value) : "";
    }
    function samePrice(a,b){
      if(typeof opts.samePrice === "function") return opts.samePrice(a,b);
      return String(a) === String(b);
    }
    function remaining(){
      return snapshot().remainingQty;
    }
    async function finish(reason,tone="normal",extra){
      const completed = snapshot(Object.assign({active:false,message:String(reason || ""),tone},extra || {}));
      clearTimer();
      run = null;
      busy = false;
      if(typeof opts.onFinish === "function") await opts.onFinish(completed);
      return completed;
    }
    async function submitFresh(top,recovery){
      if(!run) return;
      run.everReceivedBook = !!usableBook(top) || run.everReceivedBook;
      const qty = remaining();
      if(!(qty > 0)) return finish(run.label + " filled","normal",{result:"filled",statusCode:"filled"});
      const price = desiredPrice(top);
      if(!price){
        update(run.label + " waiting for a valid book price","error",{statusCode:"stale"});
        schedule();
        return;
      }
      update(recovery ? "Order cancelled by exchange (price crossed) — resubmitting GTX" : run.label + " submitting GTX",recovery ? "error" : "normal",{statusCode:recovery?"repricing":"chasing"});
      try{
        const response = await opts.submit({quantity:qty,price,state:snapshot(),recovery:!!recovery});
        if(!run) return;
        applyOrder(response || {});
        run.currentExecuted = Math.max(0,number(response && response.executedQty) || 0);
        run.price = String((response && response.price) || price);
        run.pendingAmend = false;
        run.needsSubmit = false;
        update(run.label + " chasing","normal",{statusCode:"chasing"});
      }catch(error){
        if(!run) return;
        update(run.label + " GTX rejected — retrying safely: " + (error && error.message ? error.message : String(error)),"error",{statusCode:"stopped"});
      }
      schedule();
    }
    async function recoverCrossing(_top,order){
      if(!run) return;
      if(order) applyOrder(order);
      carryCurrentFill();
      run.pendingAmend = false;
      if(!(remaining() > 0)) return finish(run.label + " filled","normal",{result:"filled",statusCode:"filled"});
      const currentBook = book();
      if(!currentBook){
        run.needsSubmit = true;
        update("Book data stale — chase paused","error",{reason:"stale-book",statusCode:"stale"});
        schedule();
        return;
      }
      run.needsSubmit = false;
      await submitFresh(currentBook,true);
    }
    async function queryCurrent(){
      if(!run || (run.orderId == null && !run.clientOrderId)) return null;
      return opts.query({symbol:run.symbol,orderId:run.orderId,clientOrderId:run.clientOrderId},snapshot());
    }
    async function tick(){
      if(!run || busy || run.canceling || run.reactiveRecovery) return;
      busy = true;
      clearTimer();
      try{
        if(run.cancelIntent){
          const intent = run.cancelIntent;
          busy = false;
          await cancel(intent.reason,intent.extra);
          return;
        }
        if(run.expiresAt && Date.now() >= run.expiresAt){
          busy = false;
          const noPrice=!run.everReceivedBook;
          await cancel(noPrice?run.label + " expired — no book data received":run.label + " expired — remaining qty cancelled",noPrice?{result:"no-price",statusCode:"no-price"}:{result:"expired",statusCode:"expired"});
          return;
        }
        let rawBook = bookState();
        let top = usableBook(rawBook);
        if(run.needsSubmit){
          if(!top){
            const hasData = !!(rawBook && (rawBook.hasData === true || rawBook.state === "stale"));
            if(!hasData && !run.firstBookWaitCompleted && typeof opts.waitForTopOfBook === "function"){
              run.firstBookWaitCompleted = true;
              update("Waiting for book data...","normal",{reason:"waiting-book",statusCode:"waiting"});
              try{ rawBook = await opts.waitForTopOfBook({timeoutMs:Number(opts.firstBookTimeoutMs) || 3000}); }
              catch(_ignored){ rawBook = null; }
              if(!run) return;
              if(run.expiresAt && Date.now() >= run.expiresAt){
                busy = false;
                await cancel(run.label + " expired — no book data received",{result:"no-price",statusCode:"no-price"});
                return;
              }
              top = usableBook(rawBook);
              if(top){
                run.everReceivedBook = true;
                await submitFresh(top,run.recovering);
                run.recovering = false;
                return;
              }
              update("Book data unavailable — chase paused","normal",{reason:"missing-book",statusCode:"waiting"});
              return;
            }
            update(hasData ? "Book data stale — chase paused" : "Book data unavailable — chase paused",hasData?"error":"normal",{reason:hasData ? "stale-book" : "missing-book",statusCode:hasData?"stale":"waiting"});
            return;
          }
          await submitFresh(top,run.recovering);
          run.recovering = false;
          return;
        }
        let order;
        const queriedIdentity = identity(run);
        try{
          order = await queryCurrent();
        }catch(error){
          if(!run || !sameIdentity(queriedIdentity,run)) return;
          update(run.label + " status check failed — chase paused: " + (error && error.message ? error.message : String(error)),"error",{statusCode:"stopped"});
          return;
        }
        if(!run || !sameIdentity(queriedIdentity,run)) return;
        if(order) applyOrder(order);
        const status = upper(order && order.status);
        if(status === "FILLED" || !(remaining() > 0)){
          await finish(run.label + " filled","normal",{result:"filled",statusCode:"filled"});
          return;
        }
        if(!order || CANCELED.has(status)){
          if(run.pendingAmend){
            await recoverCrossing(top,order);
            return;
          }
          await finish(run.label + " inactive — remaining qty not chased","error",{result:"inactive",statusCode:"stopped"});
          return;
        }
        if(run.pendingAmend) run.pendingAmend = false;
        if(status && !ACTIVE.has(status)){
          await finish(run.label + " stopped: " + status,"error",{result:"inactive",statusCode:"stopped"});
          return;
        }
        if(!top){
          update("Book data stale — chase paused","error",{reason:"stale-book",statusCode:"stale"});
          return;
        }
        run.everReceivedBook = true;
        const price = desiredPrice(top);
        if(!price){
          update(run.label + " waiting for a valid book price","error",{statusCode:"stale"});
          return;
        }
        if(samePrice(run.price,price)){
          update(run.label + " chasing","normal",{statusCode:"chasing"});
          return;
        }
        run.pendingAmend = true;
        const amendIdentity = identity(run);
        const amendQty = Math.max(0,run.requestedQty - run.carriedFilled);
        try{
          const response = await opts.amend({
            identity:{symbol:run.symbol,orderId:run.orderId,clientOrderId:run.clientOrderId},
            quantity:amendQty,
            price,
            state:snapshot()
          });
          if(!run || !sameIdentity(amendIdentity,run)) return;
          applyOrder(response || {});
          const amendStatus = upper(response && response.status);
          if(CANCELED.has(amendStatus)){
            await recoverCrossing(top,response);
            return;
          }
          run.price = String((response && response.price) || price);
          update(run.label + " chasing","normal",{statusCode:"chasing"});
        }catch(error){
          if(!run || !sameIdentity(amendIdentity,run)) return;
          let checked = null;
          try{ checked = await queryCurrent(); }catch(_ignored){}
          if(!run || !sameIdentity(amendIdentity,run)) return;
          if(!checked || CANCELED.has(upper(checked && checked.status))){
            await recoverCrossing(top,checked);
            return;
          }
          applyOrder(checked);
          run.pendingAmend = false;
          update(run.label + " amend rejected — chase paused: " + (error && error.message ? error.message : String(error)),"error",{statusCode:"stopped"});
        }
      }finally{
        busy = false;
        if(run && !run.canceling && timer == null) schedule();
      }
    }
    async function handleOrderUpdate(rawOrder){
      const order = normalizeOrder(rawOrder);
      if(!run || run.canceling || run.reactiveRecovery || !sameIdentity(order,run)) return false;
      if(!CANCELED.has(upper(order && order.status)) || !run.pendingAmend) return false;
      clearTimer();
      run.reactiveRecovery = true;
      try{
        await recoverCrossing(book(),order);
      }finally{
        if(run) run.reactiveRecovery = false;
      }
      return true;
    }
    async function start(config){
      if(run) throw new Error("A chase is already active in this chase group.");
      const input = config || {};
      const qty = number(input.quantity);
      if(!(qty > 0)) throw new Error("Chase quantity must be positive.");
      const startedAt = Date.now();
      run = {
        label:String(input.label || opts.label || "Chase"),
        symbol:String(input.symbol || ""),
        requestedQty:qty,
        carriedFilled:0,
        currentExecuted:0,
        orderId:null,
        clientOrderId:"",
        price:"",
        startedAt,
        expiresAt:number(input.expiresAt) || (number(input.maxDurationMs) ? startedAt + Number(input.maxDurationMs) : 0),
        pendingAmend:false,
        needsSubmit:true,
        recovering:false,
        firstBookWaitCompleted:false,
        everReceivedBook:false,
        reactiveRecovery:false,
        canceling:false,
        cancelIntent:null,
        meta:input.meta || null
      };
      update(run.label + " starting","normal",{statusCode:"chasing"});
      await tick();
      return snapshot();
    }
    async function cancel(reason,extra){
      if(!run) return Object.freeze({active:false});
      if(run.canceling) return snapshot();
      const cancelReason = reason || run.label + " cancelled";
      run.cancelIntent = {reason:cancelReason,extra:extra || null};
      clearTimer();
      run.canceling = true;
      update(reason || run.label + " canceling","normal",{statusCode:"canceling"});
      const id = {symbol:run.symbol,orderId:run.orderId,clientOrderId:run.clientOrderId};
      if(id.orderId == null && !id.clientOrderId) return finish(cancelReason,"normal",extra);
      try{
        let finalOrder = null;
        try{
          finalOrder = await opts.cancel(id,snapshot());
        }catch(_error){
          try{ finalOrder = await opts.query(id,snapshot()); }catch(_ignored){}
        }
        if(finalOrder) applyOrder(finalOrder);
        const confirmed = await opts.verifyCanceled(id,snapshot());
        if(!confirmed) throw new Error("cancel was not confirmed by the live open-orders snapshot");
        if(upper(finalOrder && finalOrder.status) === "FILLED") return finish(run.label + " filled","normal",{result:"filled",statusCode:"filled"});
        return finish(cancelReason,"normal",Object.assign({statusCode:"cancelled"},extra||{}));
      }catch(error){
        if(!run) return Object.freeze({active:false});
        run.canceling = false;
        update(run.label + " cancel not confirmed — chase remains locked: " + (error && error.message ? error.message : String(error)),"error",{statusCode:"stopped"});
        schedule();
        return snapshot();
      }
    }

    return Object.freeze({start,cancel,tick,handleOrderUpdate,state:() => snapshot(),isActive:() => !!run});
  }

  window.CalculatorChaseEngine = Object.freeze({create});
})();
