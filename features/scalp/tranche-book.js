(() => {
  "use strict";

  const root=window.__BT001_SCALP_BUILD__ ||= {};
  const DIRECTIONS=Object.freeze(["LONG","SHORT"]);
  const ACTIVE_STATUSES=new Set(["ENTRY_PENDING","PROTECTION_PENDING","ACTIVE","EXIT_PENDING"]);
  const upper=value=>String(value||"").toUpperCase();
  const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
  const clone=value=>value&&typeof value==="object"?JSON.parse(JSON.stringify(value)):value;

  function normalizeDirection(value){
    const direction=upper(value);
    return DIRECTIONS.includes(direction)?direction:null;
  }
  function normalizeSlot(value){return value==="scalper"?"scalper":"main";}
  function storageKey(baseKey,slot){return `${String(baseKey||"bt001_scalp_tranche_book_v2")}:${normalizeSlot(slot)}`;}
  function emptyDirection(direction){return {direction,state:"IDLE",executionLock:null,tranches:[]};}
  function create({accountSlot="main",symbol=null}={}){
    return {
      version:2,
      accountSlot:normalizeSlot(accountSlot),
      symbol:symbol?upper(symbol):null,
      directions:{LONG:emptyDirection("LONG"),SHORT:emptyDirection("SHORT")}
    };
  }
  function normalizeTranche(row,direction){
    if(!row||typeof row!=="object")return null;
    const trancheDirection=normalizeDirection(row.direction)||direction;
    const trancheId=String(row.trancheId||"").trim();
    if(!trancheId||trancheDirection!==direction)return null;
    return {
      ...clone(row),
      trancheId,
      direction,
      requestedQty:Math.max(0,number(row.requestedQty)||0),
      filledQty:Math.max(0,number(row.filledQty)||0),
      remainingQty:Math.max(0,number(row.remainingQty)??number(row.filledQty)??0),
      status:String(row.status||"ENTRY_PENDING").toUpperCase()
    };
  }
  function normalize(saved,options={}){
    const book=create({
      accountSlot:options.accountSlot??(saved&&saved.accountSlot),
      symbol:options.symbol??(saved&&saved.symbol)
    });
    for(const direction of DIRECTIONS){
      const source=saved&&saved.directions&&saved.directions[direction];
      book.directions[direction]={
        direction,
        state:String(source&&source.state||"IDLE").toUpperCase(),
        executionLock:source&&source.executionLock?String(source.executionLock):null,
        tranches:(Array.isArray(source&&source.tranches)?source.tranches:[])
          .map(row=>normalizeTranche(row,direction)).filter(Boolean)
      };
    }
    return book;
  }
  function directionBook(book,direction){
    const normalized=normalizeDirection(direction);
    return normalized&&book&&book.directions?book.directions[normalized]||null:null;
  }
  function activeTranches(book,direction){
    const branch=directionBook(book,direction);
    return branch?branch.tranches.filter(row=>ACTIVE_STATUSES.has(upper(row.status))&&Math.max(0,number(row.remainingQty)??number(row.filledQty)??number(row.requestedQty)??0)>0):[];
  }
  function count(book,direction){return activeTranches(book,direction).length;}
  function counts(book){return {LONG:count(book,"LONG"),SHORT:count(book,"SHORT")};}
  function canAdd(book,direction,limit){
    const normalized=normalizeDirection(direction),cap=Math.max(1,Math.round(number(limit)||1));
    return !!normalized&&count(book,normalized)<cap;
  }
  function add(book,tranche){
    const direction=normalizeDirection(tranche&&tranche.direction),branch=directionBook(book,direction);
    const normalized=direction&&normalizeTranche(tranche,direction);
    if(!branch||!normalized)throw new Error("Valid tranche direction and trancheId are required");
    if(branch.tranches.some(row=>row.trancheId===normalized.trancheId))throw new Error(`Duplicate tranche ${normalized.trancheId}`);
    branch.tranches.push(normalized);
    return normalized;
  }
  function find(book,trancheId){
    const id=String(trancheId||"");
    for(const direction of DIRECTIONS){
      const row=directionBook(book,direction).tranches.find(item=>item.trancheId===id);
      if(row)return row;
    }
    return null;
  }
  function findByClientId(book,clientId){
    const id=String(clientId||"");
    if(!id)return null;
    for(const direction of DIRECTIONS){
      const row=directionBook(book,direction).tranches.find(item=>
        [item.entryClientId,item.pslClientId,item.partialTpClientId,item.exitClientId].includes(id)
      );
      if(row)return row;
    }
    return null;
  }
  function close(book,trancheId,{reason=null,closedAt=Date.now(),remainingQty=0}={}){
    const row=find(book,trancheId);
    if(!row)return null;
    row.status="CLOSED";row.closeReason=reason;row.closedAt=closedAt;row.remainingQty=Math.max(0,number(remainingQty)||0);
    return row;
  }
  function remove(book,trancheId){
    const id=String(trancheId||"");
    for(const direction of DIRECTIONS){
      const branch=directionBook(book,direction),index=branch.tranches.findIndex(row=>row.trancheId===id);
      if(index>=0)return branch.tranches.splice(index,1)[0]||null;
    }
    return null;
  }
  function activeQuantity(book,direction){
    return activeTranches(book,direction).reduce((sum,row)=>sum+Math.max(0,number(row.remainingQty)??number(row.filledQty)??0),0);
  }
  function snapshot(book){return clone(normalize(book||create()));}

  root.tranches=Object.freeze({
    DIRECTIONS,ACTIVE_STATUSES,normalizeDirection,normalizeSlot,storageKey,create,normalize,
    directionBook,activeTranches,count,counts,canAdd,add,find,findByClientId,close,remove,activeQuantity,snapshot
  });
})();
