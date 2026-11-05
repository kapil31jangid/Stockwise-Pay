
import { evaluateForecast } from "./evaluation.js";

const salesHistory = [
  3, 4, 3, 5, 4, 3, 4,
  6, 7, 8, 7, 9, 10, 8
];

const result = evaluateForecast(salesHistory, 7);

console.log("\nFORECAST EVALUATION");
console.log("Days tested:", result.testDays);
console.log("Mean Absolute Error:", result.mae);

console.log("\nDay | Actual | Predicted");

for (let i = 0; i < result.testDays; i++) {
  console.log(
    `${i + 1}   | ${result.actual[i]}      | ${result.predicted[i]}`
  );
}
