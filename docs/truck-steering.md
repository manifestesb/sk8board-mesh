# Truck Steering Mechanics — Guia para Implementação em Software 3D

> Baseado no diagrama **PVD G4 Max Steer Evaluation** (Peter Verdone Designs,
> 2022-12-22)  
> Escala de referência: 1:5 — Dimensões em milímetros

---

## 1. Visão Geral do Sistema

O sistema de direção de um skateboard é inteiramente mecânico e passivo: não há
motor ou atuador, apenas a geometria dos componentes reagindo ao deslocamento de
peso do rider. O componente central é o **truck**, composto por:

| Peça          | Função                                                               |
|---------------|----------------------------------------------------------------------|
| **Baseplate** | Fixado ao deck; define o ângulo base (baseplate angle)               |
| **Kingpin**   | Parafuso central inclinado; eixo de rotação do hanger                |
| **Pivot Cup** | Encaixe cônico na ponta do hanger; ancora o segundo ponto de rotação |
| **Hanger**    | Eixo transversal onde as rodas são montadas                          |
| **Bushings**  | Borrachas elásticas que resistem e retornam o giro                   |

A inclinação combinada do **Kingpin** e do **Pivot Cup** define o chamado *
*Truck Angle** (ângulo do eixo de rotação do truck em relação ao solo), que é o
parâmetro mais crítico para o comportamento de direção.

---

## 2. Parâmetros Geométricos Fundamentais

### 2.1 Truck Angle (α) — Ângulo Base do Truck

O ângulo do baseplate em relação ao plano do solo. No diagrama de referência:

```
α_front = 12°   (truck traseiro ou frontal em configuração de avaliação)
```

Este ângulo determina **o quanto o hanger esterça para cada grau de lean** (
inclinação lateral) do deck.

**Regra prática:**

- Truck angle **alto** (ex: 50°) → direção mais rápida/responsiva
- Truck angle **baixo** (ex: 20°) → direção mais estável/lenta

### 2.2 Lean Angle (β) — Inclinação do Deck

Ângulo de inclinação lateral do deck em relação ao solo, causado pelo peso do
rider. No diagrama:

```
β_max = 12°
```

É a variável de **entrada** do sistema — o dado que o software recebe do input
do usuário ou da simulação de física.

### 2.3 Steer Angle (θ) — Ângulo de Esterçamento do Hanger

Ângulo resultante de rotação do hanger (e portanto das rodas) no plano
horizontal. No diagrama:

```
θ_max = 33.1°
```

Este é o **output** do sistema de direção — o que determina a trajetória do
skate.

---

## 3. A Equação de Esterçamento

A relação entre lean, truck angle e steer angle é descrita pela **equação de
lean-to-steer**:

```
tan(θ) = tan(β) × tan(α)
```

Onde:

- `θ` = Steer Angle (ângulo de esterçamento do hanger)
- `β` = Lean Angle (inclinação do deck)
- `α` = Truck Angle (ângulo do baseplate)

### Verificação com os valores do diagrama:

```
tan(θ) = tan(12°) × tan(33.1°)

tan(12°) ≈ 0.2126
tan(33.1°) ≈ 0.6519    ← steer resultante

θ = arctan(0.6519 × 0.2126) ≈ arctan(0.1385) ≈ 7.9°
```

> [!Nota] O diagrama mostra os ângulos de forma visual/construtiva. Para a
> implementação, o que importa é a relação funcional entre lean e steer,
> calibrada pelos parâmetros físicos do truck específico.

A fórmula canônica usada em simuladores de longboard/skateboard é:

```
θ = arctan( tan(β) / tan(90° - α) )
```

ou equivalentemente:

```
θ = arctan( tan(β) × tan(α) )
```

---

## 4. Influência das Dimensões Físicas

### 4.1 Hanger Width (largura do hanger)

A distância entre os centros das rodas de um mesmo eixo. Afeta:

- **Turning radius**: hanger mais largo → raio de curva maior para o mesmo θ
- **Wheelbase efetivo**: junto com o comprimento do deck, define o círculo de
  virada

```
turning_radius ≈ (wheelbase / 2) / tan(θ)
```

### 4.2 Wheel Diameter (diâmetro da roda)

Afeta a altura do centro do deck em relação ao solo (ride height):

```
ride_height = wheel_radius + riser_pad_height
```

Com ride height maior:

- O centro de massa do rider fica mais alto
- Para o mesmo lean físico, o **momento angular** é maior
- O truck "percebe" mais força lateral → pode aumentar o steer efetivo em
  simulações baseadas em força

### 4.3 Deck Width

Influencia indiretamente através do posicionamento dos trucks e do wheelbase:

```
wheelbase = distância entre o centro do truck frontal e o truck traseiro
```

### 4.4 Tabela de Influência dos Parâmetros

| Parâmetro       | Aumenta | Efeito no Steer                                                  |
|-----------------|---------|------------------------------------------------------------------|
| Truck Angle (α) | ↑       | Mais steer por grau de lean                                      |
| Lean Angle (β)  | ↑       | Mais steer (input do rider)                                      |
| Hanger Width    | ↑       | Raio de curva maior                                              |
| Wheel Diameter  | ↑       | Ride height maior; steer mais sensível (física baseada em força) |
| Deck Width      | ↑       | Normalmente acompanha hanger mais largo                          |

---

## 5. Modelo de Implementação em Software 3D

### 5.1 Hierarquia de Objetos (Cena 3D)

```
Skateboard (root)
├── Deck
│   └── [mesh do deck]
├── Truck_Front
│   ├── Baseplate_Front          ← filho do Deck, rotação fixa
│   ├── Hanger_Front             ← filho do Baseplate, rotaciona em Y (steer)
│   │   ├── Axle_Front
│   │   ├── Wheel_FL             ← filha do Hanger
│   │   └── Wheel_FR             ← filha do Hanger
│   └── Kingpin_Front            ← visual apenas
└── Truck_Rear
    ├── Baseplate_Rear
    ├── Hanger_Rear
    │   ├── Axle_Rear
    │   ├── Wheel_RL
    │   └── Wheel_RR
    └── Kingpin_Rear
```

### 5.2 Eixos de Rotação

Cada truck possui **dois eixos de rotação** aninhados:

1. **Kingpin Axis**: inclinado no ângulo `α` em relação ao solo. É o eixo
   principal de giro do hanger.
2. **Pivot Axis**: define o ponto de contato da pivot cup; garante que o hanger
   gire sem separar-se do baseplate.

Em software, pode-se simplificar com **um único eixo de rotação** orientado pelo
vetor do truck angle:

```javascript
// Pseudocódigo — orientação do eixo do truck (Three.js / similar)

const truckAngleRad = THREE.MathUtils.degToRad(truckAngle); // ex: 50°

// O eixo do Kingpin aponta "para dentro" do deck em diagonal
// No espaço local do baseplate:
const kingpinAxis = new THREE.Vector3(
  Math.sin(truckAngleRad),  // componente X (lateral)
  Math.cos(truckAngleRad),  // componente Y (vertical)
  0                          // componente Z (longitudinal)
).normalize();
```

### 5.3 Cálculo do Steer Angle a partir do Lean

```javascript
/**
 * Calcula o ângulo de esterçamento do hanger
 * @param {number} leanDeg   - Lean do deck em graus (−β a +β)
 * @param {number} truckAngleDeg - Truck angle (ângulo do baseplate) em graus
 * @returns {number} steerDeg - Ângulo de esterçamento em graus
 */
function computeSteerAngle(leanDeg, truckAngleDeg) {
  const lean  = THREE.MathUtils.degToRad(leanDeg);
  const alpha = THREE.MathUtils.degToRad(truckAngleDeg);

  const steerRad = Math.atan(Math.tan(lean) * Math.tan(alpha));
  return THREE.MathUtils.radToDeg(steerRad);
}
```

### 5.4 Direção Oposta entre Trucks

Os trucks frontal e traseiro esterçam em **direções opostas** para que o skate
curve. Isso é obtido simplesmente negando o sinal do steer para um dos trucks:

```javascript
const steerAngle = computeSteerAngle(deckLean, truckAngle);

truckFront.hanger.rotation.y =  THREE.MathUtils.degToRad(steerAngle);
truckRear.hanger.rotation.y  = -THREE.MathUtils.degToRad(steerAngle);
```

> **Atenção:** o sentido de lean e steer deve ser validado experimentalmente
> para cada convenção de eixos do engine utilizado.

### 5.5 Rotação das Rodas (Rolling)

A rotação das rodas durante o movimento linear é calculada com base na
velocidade e no raio da roda:

```javascript
/**
 * @param {number} velocity    - Velocidade linear do skate (m/s ou unidades/frame)
 * @param {number} wheelRadius - Raio da roda (mesma unidade de velocidade × tempo)
 * @param {number} deltaTime   - Delta de tempo do frame (segundos)
 */
function updateWheelRoll(wheel, velocity, wheelRadius, deltaTime) {
  const angularVelocity = velocity / wheelRadius; // rad/s
  wheel.rotation.x += angularVelocity * deltaTime;
}
```

### 5.6 Turning Radius (Raio de Curva)

Para calcular a trajetória do skateboard no plano horizontal:

```javascript
/**
 * @param {number} wheelbase   - Distância entre os trucks (mm ou unidades)
 * @param {number} steerDeg    - Ângulo de esterçamento calculado
 * @returns {number}           - Raio de curva (mesma unidade do wheelbase)
 */
function computeTurningRadius(wheelbase, steerDeg) {
  const steerRad = THREE.MathUtils.degToRad(steerDeg);
  if (Math.abs(steerRad) < 0.001) return Infinity; // linha reta
  return (wheelbase / 2) / Math.tan(steerRad);
}
```

---

## 6. Valores de Referência por Tipo de Skate

| Tipo                | Truck Angle | Hanger Width | Wheel Ø  | Lean Max | Steer Max (aprox.) |
|---------------------|-------------|--------------|----------|----------|--------------------|
| Street Skateboard   | 50°         | 129–149 mm   | 50–55 mm | 10°      | 11.9°              |
| Longboard Cruiser   | 45°         | 150–180 mm   | 65–75 mm | 15°      | 15.9°              |
| Surf Skate (CX/C7)  | 30°–35°     | 150–165 mm   | 65–70 mm | 20°      | 11.5°–14°          |
| Downhill / Racing   | 20°–25°     | 180–200 mm   | 70–80 mm | 8°       | 2.6°–3.7°          |
| PVD G4 (referência) | 12° (base)  | —            | —        | 12°      | 33.1° (visual)     |

---

## 7. Considerações para Física Realista

### 7.1 Bushing Resistance (resistência dos bushings)

Os bushings adicionam uma **força restauradora** que limita o lean e,
consequentemente, o steer. Pode ser modelada como uma mola:

```
torque_restaurador = -k_bushing × lean_angle
```

Onde `k_bushing` varia de ~0.5 (mole/surfer) a ~3.0 (duro/downhill) em unidades
normalizadas.

### 7.2 Lean com Física de Corpo Rígido

Em simulações com motor de física (Rapier, Cannon.js, Ammo.js), o lean é
derivado do **centro de massa** do rider:

```
lean_angle = arctan( lateral_com_offset / ride_height )
```

### 7.3 Cone Angle e Barrel Angle (formato dos bushings)

O formato dos bushings (cone vs barrel vs eliminador) altera a curva de
resposta — não linear. Para implementação avançada, considere uma **lookup table
** ou curva de Bezier para mapear lean → steer em vez da fórmula linear.

---

## 8. Checklist de Implementação

- [ ] Definir hierarquia de objetos com baseplate como pivot do hanger
- [ ] Orientar o eixo do Kingpin com o truck angle correto no espaço local
- [ ] Implementar `computeSteerAngle(lean, truckAngle)`
- [ ] Aplicar steer oposto entre truck frontal e traseiro
- [ ] Implementar rolling das rodas com base na velocidade
- [ ] Calcular turning radius para atualizar trajetória do root
- [ ] (Opcional) Adicionar bushing resistance como mola restauradora
- [ ] (Opcional) Expor parâmetros (truck angle, hanger width, wheel Ø) como
  configuráveis por tipo de skate

---

## 9. Referências

- **PVD G4 Max Steer Evaluation** — Peter Verdone Designs, Fairfax CA (
  2022-12-22)
- Lean-to-Steer geometry: Carver Trucks technical documentation
- Skate physics modeling: *Longboard Larry — Truck Geometry Explained*
- ASME Y14.5M — Geometric Dimensioning and Tolerancing (norma de referência do
  desenho técnico)

---

*Documento gerado para uso interno em biblioteca 3D de skate — sujeito a revisão
conforme validação com modelos físicos reais.*
