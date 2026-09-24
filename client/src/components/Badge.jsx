export default function Badge({value}){return <span className={`badge ${String(value).toLowerCase()}`}>{String(value||'UNASSIGNED').replace('_',' ')}</span>}
