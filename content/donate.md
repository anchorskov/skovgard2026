---
title: "Support Jimmy"
url: "/donate/"
slug: "donate"
draft: false
---

<!-- updated to reflect FEC rules -->

{{< rawhtml >}}
<style>
  /* full‑screen layout */
  html, body, main, .post { margin:0; padding:0; width:100vw; height:100vh; }
  .donate-iframe { width:100vw; height:100vh; border:none; display:block; }
  /* disclaimer */
  #disclaimer { padding:2rem; font-size:1rem; line-height:1.5; }
  #agree-btn {
    display:block; margin:1.5rem 0; padding:0.75rem 1.5rem;
    font-size:1rem; background:#1f2937; color:#fff;
    border:none; border-radius:0.375rem; cursor:pointer;
  }
</style>

<div id="disclaimer">
  <ol>
    <li>I’m running to secure Wyoming’s Republican nomination for the U.S. Senate—focused on our shared future.</li>
    <li>This Is Us is my platform.</li>
    <li>All contributions follow FEC limits.</li>
    <li>No foreign national may contribute.</li>
    <li>Your contributions are not tax deductible.</li>
    <li>I will file, report, and account for every penny with the Federal Election Commission (reports available at fec.gov).</li>
  </ol>

  <h3>Contribution Rules</h3>
  <ul>
    <li>I am a U.S. citizen or lawfully admitted permanent resident (i.e., green card holder).</li>
    <li>This contribution is made from my own funds, and funds are not being provided to me by another person or entity for the purpose of making this contribution.</li>
    <li>I am at least eighteen years old.</li>
    <li>I am not a federal contractor.</li>
    <li>I am making this contribution with my own personal check or credit card and not with a corporate or business credit card or a card issued to another person.</li>
  </ul>

  <p><strong>By proceeding with this transaction, you agree to the contribution rules above.</strong></p>

  <p><em>Contributions or gifts are not tax deductible.</em></p>

  <p>The maximum amount an individual may contribute is $3,500 per election. Your contribution (up to $3,500) will be designated for the primary election. The next $3,500 will be designated for the general election.</p>

  <p><em>Federal law requires us to use our best efforts to collect and report the name, address, occupation, and employer of individuals whose contribution exceeds $200 in an election cycle.</em></p>
<p>Online donations incur a 4% + $0.50 processing fee. To avoid this fee, send a check payable to <em>Skovgard for Senate, 5685 Hanly, Mills, WY 82604</em>.</p>
  <button id="agree-btn">
    I agree to the terms above — select here to proceed to donation page
  </button>
</div>

<div id="donate-content" style="display:none;">
  <iframe
    class="donate-iframe"
    src="https://secure.anedot.com/skovgard-for-senate/...embed=true"
    allowtransparency="true">
  </iframe>
</div>

<script>
  document.getElementById("agree-btn")
    .addEventListener("click", () => {
      document.getElementById("disclaimer").style.display = "none";
      document.getElementById("donate-content").style.display = "block";
    });
</script>
{{< /rawhtml >}}
