// get Firebase things from the global
const { db, collection, addDoc, getDocs, query, where, serverTimestamp, auth } = window.firebaseDeps;
let currentSection = 'cooking';
let calculationData = {};
let emissionsChart = null;



function showSection(section) {
    document.getElementById(currentSection).classList.remove('active');
    document.getElementById('results').classList.remove('active');
    document.getElementById(section).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[onclick="showSection('${section}')"]`).classList.add('active');
    currentSection = section;
}

function updateSliderValue(slider, outputId) {
    document.getElementById(outputId).textContent = slider.value;
}

function validateInputs(inputs) {
    for (const [key, value] of Object.entries(inputs)) {
        if (isNaN(value) || value < 0) {
            alert(`Please enter a valid number for ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
            return false;
        }
    }
    return true;
}

function calculatecooking() {
    const fuelType = document.getElementById('fuelTypeSelect').value;
    const inputs = {
        mealsNumber: parseFloat(document.getElementById('mealsNumberValue').textContent),
        cookingDuration: parseFloat(document.getElementById('cookingDurationValue').textContent),
    };

    const fuelFactors = {
        'wood': 1.2,
        'charcoal': 1.0,
        'lpg': 0.7,
        'electricity': 0.1
    };

    const fuelFactor = fuelFactors[fuelType] || 0.8;

    if (!validateInputs(inputs)) return;

    const results = {
        mealsNumber: inputs.mealsNumber * fuelFactor * 30,
        cookingDuration: inputs.cookingDuration * 0.4 * 30
    };

    results.total = Object.values(results).reduce((sum, val) => sum + val, 0);
    calculationData = { ...inputs, ...results };
    displayResults(results);
}

function displayResults(data) {
    document.getElementById(currentSection).classList.remove('active');


    const totalKg = data.total.toFixed(1);
    const dailyAverage = (data.total / 30).toFixed(1);

    const safePercentage = (value) => {
        if (totalKg === 0) return 0;
        return (value / totalKg) * 100;
    };

    const summaryContainer = document.querySelector('.emissions-summary');
    summaryContainer.innerHTML = '';

    if (currentSection === 'cooking') {
        summaryContainer.innerHTML = `
            <div class="emissions-category">
                <div class="category-name">Cooking Emissions</div>
                <div class="category-value">${data.mealsNumber.toFixed(1)} kg CO₂e/month</div>
                <div class="category-percentage">${safePercentage(data.mealsNumber).toFixed(1)}% of total</div>
            </div>
            <div class="emissions-category">
                <div class="category-name">Duration Emissions</div>
                <div class="category-value">${data.cookingDuration.toFixed(1)} kg CO₂e/month</div>
                <div class="category-percentage">${safePercentage(data.cookingDuration).toFixed(1)}% of total</div>
            </div>
        `;
    }

    const monthlyTonnes = (data.total * 12 / 1000).toFixed(1);
    document.getElementById('totalEmissions').textContent = `Total Annual Emissions: ${monthlyTonnes} Tonnes CO₂e/Year`;
    document.getElementById('dailyAverage').textContent = `Daily Average: ${dailyAverage} kg CO₂e/day`;

    document.getElementById('results').classList.add('active');
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

    // Save results to Firestore for logged-in user
    if (window.firebaseDeps && window.firebaseDeps.auth.currentUser) {
    const { db, collection, addDoc, serverTimestamp, auth } = window.firebaseDeps;
    const user = auth.currentUser;

    addDoc(collection(db, "users", user.uid, "reports"), {
        uid: user.uid,
        email: user.email,
        section: currentSection, // e.g. "cooking"
        inputs: calculationData, // all input + result values
        totalEmissions: data.total,
        createdAt: serverTimestamp()
    })
    .then(() => {
        console.log("Calculation saved for user:", user.email);
    })
    .catch(err => {
        console.error("Error saving calculation:", err);
    });
}


}

//Update your dashboard to read from Firestore, not localStorage.
async function loadDashboard() {
  const user = auth.currentUser;
  if (!user) {
    document.getElementById("dashboardTotal").textContent = "Please log in.";
    return;
  }

  const reportsRef = collection(db, "users", user.uid, "reports");
  const querySnapshot = await getDocs(reportsRef);

  let total = 0;
  let count = 0;
  const reports = [];

  querySnapshot.forEach(doc => {
    const data = doc.data() || {};
    const val = Number(data.totalEmissions) || 0;

    let ts = 0;
    if (data.createdAt && typeof data.createdAt.toMillis === 'function') {
      ts = data.createdAt.toMillis();
    } else if (doc.createTime) {
      const parsed = new Date(doc.createTime);
      if (!isNaN(parsed)) ts = parsed.getTime();
    }

    reports.push({ val, ts });
    total += val;
    count++;
  });

  // keep the reports sorted by timestamp if available
  reports.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  if (count === 0) {
    document.getElementById("dashboardTotal").textContent = "No emissions recorded yet.";
  } else {
    document.getElementById("dashboardTotal").textContent =
      `Total Emissions: ${total.toFixed(1)} kg CO₂e (from ${count} report(s))`;
  }

  const storedEmissions = reports.map(r => r.val);

  // <<< --- CHANGE HERE: create simple Report N labels --- >>>
  const labels = reports.map((_, idx) => `Report ${idx + 1}`);
  // <<< -------------------------------------------------- >>>

  if (window.emissionsChartGlobal && typeof window.emissionsChartGlobal.destroy === 'function') {
    try { window.emissionsChartGlobal.destroy(); } catch (e) { console.warn('Failed to destroy existing chart', e); }
    window.emissionsChartGlobal = null;
  }

  if (storedEmissions.length > 0) {
    const canvas = document.getElementById('emissionsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    window.emissionsChartGlobal = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Emissions (kg CO₂e)',
          data: storedEmissions,
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Yearly Emissions Records'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'kg CO₂e' }
          },
          x: {
            title: { display: true, text: 'Reports' }
          }
        }
      }
    });
  } else {
    const canvas = document.getElementById('emissionsChart');
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}





function getIconForCategory(category) {
    const icons = {
        'mealsNumber': 'fas fa-car',
        'Waste': 'fas fa-trash',
        'cookingDuration': 'fas fa-bolt',
        'Meals': 'fas fa-utensils',
        'Materials': 'fas fa-cubes',
        'Machinery': 'fas fa-tractor',
        'Transport': 'fas fa-truck',
        'Energy': 'fas fa-plug',
        'Water': 'fas fa-tint'
    };

    return `<i class="${icons[category] || 'fas fa-circle'}"></i>`;
}

// Ensure dashboard loads when user logs in
auth.onAuthStateChanged(user => {
  if (user) {
    loadDashboard();
  } else {
    document.getElementById("dashboardTotal").textContent = "Please log in.";
  }
});


