(() => {
  "use strict";

  const ACTIVE = new Set(["NEW","PARTIALLY_FILLED"]);
  const CANCELED = new Set(["CANCELED","CANCELLED","EXPIRED","REJECTED"]);

  function number(value){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function upper(value){ return String(value == null ? "" : value).toUpperCase(); }
  function identity(order){
    if(!order) return null;
    return {
      symbol:String(order.symbol || ""),
      orderId:order.orderId != null ? order.orderId : null,
      clientOrderId:String(order.clientOrderId || order.origClientOrderId || "")
    };
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
      const nextIdentity = identity(order);
      if(nextIdentity){
        run.orderId = nextIdentity.orderId;
        run.clientOrderId = nextIdentity.clientOrderId;
      }
      const executed = Math.max(0,number(order.executedQty) || 0);
      run.currentExecuted = Math.max(run.currentExecuted,executed);
      if(number(order.price) > 0) run.price = String(order.price);
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
      const qty = remaining();
      if(!(qty > 0)) return finish(run.label + " filled","normal",{result:"filled"});
      const price = desiredPrice(top);
      if(!price){
        update(run.label + " waiting for a valid book price","error");
        schedule();
        return;
      }
      update(recovery ? "Order cancelled by exchange (price crossed) — resubmitting GTX" : run.label + " submitting GTX",recovery ? "error" : "normal");
      try{
        const response = await opts.submit({quantity:qty,price,state:snapshot(),recovery:!!recovery});
        if(!run) return;
        applyOrder(response || {});
        run.currentExecuted = Math.max(0,number(response && response.executedQty) || 0);
        run.price = String((response && response.price) || price);
        run.pendingAmend = false;
        run.needsSubmit = false;
        update(run.label + " chasing");
      }catch(error){
        if(!run) return;
        update(run.label + " GTX rejected — retrying safely: " + (error && error.message ? error.message : String(error)),"error");
      }
      schedule();
    }
    async function recoverCrossing(_top,order){
      if(!run) return;
      if(order) applyOrder(order);
      carryCurrentFill();
      run.pendingAmend = false;
      if(!(remaining() > 0)) return finish(run.label + " filled","normal",{result:"filled"});
      const currentBook = book();
      if(!currentBook){
        run.needsSubmit = true;
        update("Book data stale — chase paused","error",{reason:"stale-book"});
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
      if(!run || busy || run.canceling) return;
      busy = true;
      clearTimer();
      try{
        if(run.expiresAt && Date.now() >= run.expiresAt){
          busy = false;
          await cancel(run.label + " expired — remaining qty cancelled",{result:"expired"});
          return;
        }
        let rawBook = bookState();
        let top = usableBook(rawBook);
        if(run.needsSubmit){
          if(!top){
            const hasData = !!(rawBook && (rawBook.hasData === true || rawBook.state === "stale"));
            if(!hasData && !run.firstBookWaitCompleted && typeof opts.waitForTopOfBook === "function"){
              run.firstBookWaitCompleted = true;
              update("Waiting for book data...","normal",{reason:"waiting-book"});
              try{ rawBook = await opts.waitForTopOfBook({timeoutMs:Number(opts.firstBookTimeoutMs) || 3000}); }
              catch(_ignored){ rawBook = null; }
              if(!run) return;
              if(run.expiresAt && Date.now() >= run.expiresAt){
                busy = false;
                await cancel(run.label + " expired — no book data received",{result:"expired"});
                return;
              }
              top = usableBook(rawBook);
              if(top){
                await submitFresh(top,run.recovering);
                run.recovering = false;
                return;
              }
              update("Book data unavailable — chase paused","error",{reason:"missing-book"});
              return;
            }
            update(hasData ? "Book data stale — chase paused" : "Book data unavailable — chase paused","error",{reason:hasData ? "stale-book" : "missing-book"});
            return;
          }
          await submitFresh(top,run.recovering);
          run.recovering = false;
          return;
        }
        let order;
        try{
          order = await queryCurrent();
        }catch(error){
          update(run.label + " status check failed — chase paused: " + (error && error.message ? error.message : String(error)),"error");
          return;
        }
        if(!run) return;
        if(order) applyOrder(order);
        const status = upper(order && order.status);
        if(status === "FILLED" || !(remaining() > 0)){
          await finish(run.label + " filled","normal",{result:"filled"});
          return;
        }
        if(!order || CANCELED.has(status)){
          if(run.pendingAmend){
            await recoverCrossing(top,order);
            return;
          }
          await finish(run.label + " inactive — remaining qty not chased","error",{result:"inactive"});
          return;
        }
        if(run.pendingAmend) run.pendingAmend = false;
        if(status && !ACTIVE.has(status)){
          await finish(run.label + " stopped: " + status,"error",{result:"inactive"});
          return;
        }
        if(!top){
          update("Book data stale — chase paused","error",{reason:"stale-book"});
          return;
        }
        const price = desiredPrice(top);
        if(!price){
          update(run.label + " waiting for a valid book price","error");
          return;
        }
        if(samePrice(run.price,price)){
          update(run.label + " chasing");
          return;
        }
        run.pendingAmend = true;
        const amendQty = Math.max(0,run.requestedQty - run.carriedFilled);
        try{
          const response = await opts.amend({
            identity:{symbol:run.symbol,orderId:run.orderId,clientOrderId:run.clientOrderId},
            quantity:amendQty,
            price,
            state:snapshot()
          });
          if(!run) return;
          applyOrder(response || {});
          const amendStatus = upper(response && response.status);
          if(CANCELED.has(amendStatus)){
            await recoverCrossing(top,response);
            return;
          }
          run.price = String((response && response.price) || price);
          update(run.label + " chasing");
        }catch(error){
          if(!run) return;
          let checked = null;
          try{ checked = await queryCurrent(); }catch(_ignored){}
          if(!checked || CANCELED.has(upper(checked && checked.status))){
            await recoverCrossing(top,checked);
            return;
          }
          applyOrder(checked);
          run.pendingAmend = false;
          update(run.label + " amend rejected — chase paused: " + (error && error.message ? error.message : String(error)),"error");
        }
      }finally{
        busy = false;
        if(run && !run.canceling && timer == null) schedule();
      }
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
        canceling:false,
        meta:input.meta || null
      };
      update(run.label + " starting");
      await tick();
      return snapshot();
    }
    async function cancel(reason,extra){
      if(!run) return Object.freeze({active:false});
      if(run.canceling) return snapshot();
      clearTimer();
      run.canceling = true;
      update(reason || run.label + " canceling");
      const id = {symbol:run.symbol,orderId:run.orderId,clientOrderId:run.clientOrderId};
      if(id.orderId == null && !id.clientOrderId) return finish(reason || run.label + " cancelled","normal",extra);
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
        if(upper(finalOrder && finalOrder.status) === "FILLED") return finish(run.label + " filled","normal",{result:"filled"});
        return finish(reason || run.label + " cancelled","normal",extra);
      }catch(error){
        if(!run) return Object.freeze({active:false});
        run.canceling = false;
        update(run.label + " cancel not confirmed — chase remains locked: " + (error && error.message ? error.message : String(error)),"error");
        schedule();
        return snapshot();
      }
    }

    return Object.freeze({start,cancel,tick,state:() => snapshot(),isActive:() => !!run});
  }

  window.CalculatorChaseEngine = Object.freeze({create});
})();
