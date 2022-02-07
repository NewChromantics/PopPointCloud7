precision highp float;
varying vec2 Uv;
uniform sampler2D OldPositionsTexture;
uniform sampler2D VelocitysTexture;

const float Timestep = 1.0 / 60.0;

void main()
{
	vec4 Pos4 = texture2D( OldPositionsTexture, Uv );
	vec3 Velocity = texture2D( VelocitysTexture, Uv ).xyz;
	
	Pos4.xyz += Velocity * Timestep;
	
	gl_FragColor = Pos4;
}

