// Las pruebas corren en Node, fuera de un pedido de Next: no hay galletas.
// `marcaDelPedido()` atrapa esto y usa la marca fija, como en un script.
export function cookies() {
  throw new Error("Fuera de un pedido de Next");
}
export function headers() {
  throw new Error("Fuera de un pedido de Next");
}
