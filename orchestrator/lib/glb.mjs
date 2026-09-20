// Lecture minimale d un .glb : triangles, bounds, nombre de meshes/materiaux. Sans dependance.
export function glbStats(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('pas un glb');
    const chunkLength = view.getUint32(12, true);
    const json = JSON.parse(Buffer.from(buffer.buffer, buffer.byteOffset + 20, chunkLength).toString('utf8'));
    let triangles = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of json.meshes ?? []) {
        for (const primitive of mesh.primitives ?? []) {
            if (primitive.indices !== undefined) triangles += Math.floor(json.accessors[primitive.indices].count / 3);
            else triangles += Math.floor(json.accessors[primitive.attributes.POSITION].count / 3);
            const position = json.accessors[primitive.attributes.POSITION];
            for (let axis = 0; axis < 3; axis += 1) {
                min[axis] = Math.min(min[axis], position.min?.[axis] ?? 0);
                max[axis] = Math.max(max[axis], position.max?.[axis] ?? 0);
            }
        }
    }
    return { triangles, bounds: { min, max }, meshes: (json.meshes ?? []).length, materials: (json.materials ?? []).length, size: [0, 1, 2].map((axis) => max[axis] - min[axis]) };
}

// Facteur d echelle uniforme pour amener le modele dans les dimensions cibles (le plus grand axe dicte).
// Echelle par axe : etire le modele pour remplir exactement la boite demandee. Reservee aux
// formes dont l etirement ne se voit pas (barre, tige, poutre, banniere). Sur un personnage ou
// un objet reconnaissable, elle deforme — d ou le choix explicite dans le ticket.
export function fitScaleAxes(actualSize, targetSize) {
    return actualSize.map((value, axis) => (value > 1e-6 && targetSize[axis] > 0 ? targetSize[axis] / value : 1));
}

export function fitScale(actualSize, targetSize) {
    const ratios = actualSize.map((value, axis) => (value > 1e-6 && targetSize[axis] > 0 ? targetSize[axis] / value : Infinity)).filter(Number.isFinite);
    return ratios.length ? Math.min(...ratios) : 1;
}
