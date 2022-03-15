#version 300 es
precision highp float;
in vec2 FragColourUv;
in vec2 FragDepthUv;
out vec4 OutFragColor;

uniform sampler2D ColourImage;
uniform sampler2D DepthImage;

void main()
{
	OutFragColor = texture(ColourImage,FragColourUv);
	//OutFragColor = texture(DepthImage,FragDepthUv);
	//OutFragColor.xy =FragColourUv;
	
	vec4 DepthSample = texture(DepthImage,FragDepthUv);
	float Alpha = max( DepthSample.x, max( DepthSample.y, DepthSample.z ) ) > 0.50 ? 1.0 : 0.0;
	//OutFragColor.w = Alpha;
	if ( Alpha < 0.5 )
	{
		//discard;
	}
}

